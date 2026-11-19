/**
 * The worker's side of the protocol: queues calls, honours cancellation and talks to the engine.
 * Kept free of `self`/`postMessage` so it can be tested in Node; `engine.worker.ts` wires it up.
 */
import type { PdfiumEngine, PagePixels } from "./pdfium-engine";
import type { EngineError, EngineMethod, EngineRequest, EngineResponse, OpenSource } from "./protocol";

/** What the host needs from its environment. */
export interface EngineHostDeps {
  /** Fetches `pdfium.wasm`. */
  loadWasm(url: string): Promise<ArrayBuffer>;
  createEngine(wasm: ArrayBuffer): Promise<Pick<PdfiumEngine, "open" | "close" | "renderPage" | "assemble">>;
  /** Turns raw pixels into a transferable bitmap. */
  toBitmap(pixels: PagePixels): Promise<ImageBitmap>;
  /** Sends a response, moving `transfer` objects instead of copying them. */
  post(response: EngineResponse, transfer?: Transferable[]): void;
}

type CallRequest = Extract<EngineRequest, { kind: "call" }>;
type Engine = Awaited<ReturnType<EngineHostDeps["createEngine"]>>;

/** Thrown inside a handler to send a typed error back to the caller. */
class HostError extends Error {
  readonly detail: EngineError;

  /**
   * @param detail The error to send back.
   */
  constructor(detail: EngineError) {
    super(detail.message);
    this.detail = detail;
  }
}

/**
 * Creates the request handler that runs inside the worker.
 * @param deps Environment hooks (fetch, engine factory, bitmap conversion, postMessage).
 * @returns `receive`, to be called with every message the worker gets.
 */
export function createEngineHost(deps: EngineHostDeps): { receive(request: EngineRequest): void } {
  const queue: CallRequest[] = [];
  const cancelled = new Set<number>();
  /** Bytes of encrypted files waiting for a password, so a retry does not resend the file. */
  const locked = new Map<string, ArrayBuffer>();
  let engine: Engine | null = null;
  let draining = false;
  let nextLockedId = 1;

  const requireEngine = (): Engine => {
    if (!engine) throw new HostError({ code: "not-initialized", message: "Call init before using the engine." });
    return engine;
  };

  const resolveSource = (source: OpenSource): ArrayBuffer => {
    if ("bytes" in source) return source.bytes;
    const bytes = locked.get(source.lockedId);
    if (!bytes) throw new HostError({ code: "unknown-document", message: "The locked file is no longer held." });
    return bytes;
  };

  const handlers: { [M in EngineMethod]: (params: Extract<CallRequest, { method: M }>["params"]) => Promise<[unknown, Transferable[]?]> } = {
    async init({ wasmUrl }) {
      engine ??= await deps.createEngine(await deps.loadWasm(wasmUrl));
      return [null];
    },
    async open({ source, password }) {
      const bytes = resolveSource(source);
      const opened = requireEngine().open(bytes, password);
      if (opened.ok) {
        if ("lockedId" in source) locked.delete(source.lockedId);
        const { docId, pageSizes } = opened.value;
        return [{ docId, pageCount: pageSizes.length, pageSizes }];
      }
      if (opened.error === "damaged") throw new HostError({ code: "damaged", message: "The file could not be parsed." });
      const lockedId = "lockedId" in source ? source.lockedId : `locked-${nextLockedId++}`;
      locked.set(lockedId, bytes);
      throw new HostError({ code: opened.error, message: "The file needs a password.", lockedId });
    },
    async close({ docId }) {
      requireEngine().close(docId);
      return [null];
    },
    async renderPage({ docId, pageIndex, width, height, rotation }) {
      const rendered = requireEngine().renderPage(docId, pageIndex, width, height, rotation);
      if (!rendered.ok) throw new HostError({ code: "unknown-document", message: `No open document ${docId}.` });
      const bitmap = await deps.toBitmap(rendered.value);
      return [{ bitmap, width, height }, [bitmap]];
    },
    async assemble({ parts }) {
      const built = requireEngine().assemble(parts);
      if (!built.ok) {
        const code = built.error === "unknown-document" ? "unknown-document" : "assemble-failed";
        throw new HostError({ code, message: "The new file could not be built." });
      }
      return [{ bytes: built.value }, [built.value]];
    },
  };

  const run = async (request: CallRequest): Promise<void> => {
    if (cancelled.delete(request.requestId)) {
      deps.post({ requestId: request.requestId, ok: false, error: { code: "cancelled", message: "Cancelled." } });
      return;
    }
    try {
      const handler = handlers[request.method] as (params: unknown) => Promise<[unknown, Transferable[]?]>;
      const [result, transfer] = await handler(request.params);
      deps.post({ requestId: request.requestId, ok: true, result }, transfer);
    } catch (error) {
      const detail: EngineError = error instanceof HostError ? error.detail : { code: "engine-failed", message: String(error) };
      deps.post({ requestId: request.requestId, ok: false, error: detail });
    }
  };

  // Calls run one at a time. Draining on a later task lets cancel messages that arrive in the same
  // burst land before the render they cancel starts.
  const drain = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    while (queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const next = queue.shift();
      if (next) await run(next);
    }
    draining = false;
  };

  return {
    receive(request) {
      if (request.kind === "cancel") {
        cancelled.add(request.requestId);
        return;
      }
      queue.push(request);
      void drain();
    },
  };
}
