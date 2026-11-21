/**
 * The worker's side of the protocol: queues calls, honours cancellation and talks to the engine.
 * Kept free of `self`/`postMessage` so it can be tested in Node; `engine.worker.ts` wires it up.
 */
import type { PdfiumEngine, PagePixels } from "./pdfium-engine";
import type { Result } from "@pdf-editor/shared";
import type { EngineError, EngineErrorCode, EngineMethod, EngineRequest, EngineResponse, OpenSource } from "./protocol";

/** The engine methods the host forwards calls to. */
type EngineApi = Pick<
  PdfiumEngine,
  | "open"
  | "close"
  | "renderPage"
  | "assemble"
  | "getAnnotations"
  | "putAnnotation"
  | "removeAnnotation"
  | "restoreAnnotation"
  | "getTextRects"
  | "findText"
  | "getTextObjects"
  | "getTextObjectAt"
  | "replacePageText"
  | "addPageText"
  | "showPageText"
  | "movePageText"
  | "renderTextObject"
>;

/** What the host needs from its environment. */
export interface EngineHostDeps {
  /** Fetches `pdfium.wasm`. */
  loadWasm(url: string): Promise<ArrayBuffer>;
  createEngine(wasm: ArrayBuffer): Promise<EngineApi>;
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

/** Messages for the engine failures a caller can act on. */
const FAILURE_MESSAGES: Partial<Record<EngineErrorCode, string>> = {
  "unknown-document": "The document or page is not open.",
  "unknown-annotation": "The page has no annotation with that id.",
  "annotation-failed": "The annotation could not be written.",
  "text-edit-failed": "That text could not be changed.",
};

/**
 * Returns a result's value, or throws it as an error for the caller.
 * @param result An engine result.
 * @returns The value.
 */
function unwrap<T>(result: Result<T, EngineErrorCode>): T {
  if (result.ok) return result.value;
  throw new HostError({ code: result.error, message: FAILURE_MESSAGES[result.error] ?? "The engine failed." });
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

  const handlers: {
    [M in EngineMethod]: (params: Extract<CallRequest, { method: M }>["params"]) => Promise<[unknown, Transferable[]?]>;
  } = {
    async init({ wasmUrl }) {
      engine ??= await deps.createEngine(await deps.loadWasm(wasmUrl));
      return [null];
    },
    async open({ source, password }) {
      const bytes = resolveSource(source);
      const opened = requireEngine().open(bytes, password);
      if (opened.ok) {
        if ("lockedId" in source) locked.delete(source.lockedId);
        const { docId, pages } = opened.value;
        return [{ docId, pageCount: pages.length, pages }];
      }
      if (opened.error === "damaged")
        throw new HostError({ code: "damaged", message: "The file could not be parsed." });
      const lockedId = "lockedId" in source ? source.lockedId : `locked-${nextLockedId++}`;
      locked.set(lockedId, bytes);
      throw new HostError({ code: opened.error, message: "The file needs a password.", lockedId });
    },
    async close({ docId }) {
      requireEngine().close(docId);
      return [null];
    },
    async renderPage({ docId, pageIndex, width, height, rotation, hideEditable }) {
      const rendered = requireEngine().renderPage({ docId, pageIndex }, { width, height }, rotation, hideEditable);
      if (!rendered.ok) throw new HostError({ code: "unknown-document", message: `No open document ${docId}.` });
      const bitmap = await deps.toBitmap(rendered.value);
      return [{ bitmap, width, height }, [bitmap]];
    },
    async getAnnotations(at) {
      return [unwrap(requireEngine().getAnnotations(at))];
    },
    async putAnnotation({ annotation, ...at }) {
      return [unwrap(requireEngine().putAnnotation(at, annotation))];
    },
    async removeAnnotation({ id, ...at }) {
      return [unwrap(requireEngine().removeAnnotation(at, id))];
    },
    async restoreAnnotation({ id, ...at }) {
      return [unwrap(requireEngine().restoreAnnotation(at, id))];
    },
    async getTextRects({ from, to, ...at }) {
      return [unwrap(requireEngine().getTextRects(at, from, to))];
    },
    async findText({ docId, pageIndexes, query, limit }) {
      return [unwrap(requireEngine().findText(docId, pageIndexes, query, limit))];
    },
    async getTextObjects(at) {
      return [unwrap(requireEngine().getTextObjects(at))];
    },
    async getTextObjectAt({ point, ...at }) {
      return [unwrap(requireEngine().getTextObjectAt(at, point))];
    },
    async replacePageText({ id, newId, text, ...at }) {
      return [unwrap(requireEngine().replacePageText(at, id, newId, text))];
    },
    async addPageText({ docId, pageIndex, lines, ids, fontSize, color, angle }) {
      return [unwrap(requireEngine().addPageText({ docId, pageIndex }, lines, { fontSize, color, angle }, ids))];
    },
    async movePageText({ id, dx, dy, ...at }) {
      return [unwrap(requireEngine().movePageText(at, id, dx, dy))];
    },
    async renderTextObject({ id, scale, ...at }) {
      const rendered = unwrap(requireEngine().renderTextObject(at, id, scale));
      const bitmap = await deps.toBitmap(rendered);
      return [{ bitmap, width: rendered.width, height: rendered.height }, [bitmap]];
    },
    async showPageText({ show, hide, ...at }) {
      return [unwrap(requireEngine().showPageText(at, show, hide))];
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
      const detail: EngineError =
        error instanceof HostError ? error.detail : { code: "engine-failed", message: String(error) };
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
