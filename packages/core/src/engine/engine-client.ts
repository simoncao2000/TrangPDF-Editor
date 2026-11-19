/**
 * The core's side of the protocol: sends typed calls to the worker and matches the replies.
 */
import type { EngineError, EngineMethod, EngineParams, EngineRequest, EngineResponse, EngineResult } from "./protocol";

/** The parts of `Worker` the client uses, so tests can pass a fake. */
export interface EngineTransport {
  postMessage(message: EngineRequest, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<EngineResponse>) => void): void;
  addEventListener(type: "error", listener: (event: Event) => void): void;
  terminate(): void;
}

/** A pending call. `cancel()` is safe to call at any time, including after it settled. */
export interface EngineCall<T> {
  readonly promise: Promise<T>;
  cancel(): void;
}

/** Rejection value for every failed call. */
export class EngineCallError extends Error {
  readonly detail: EngineError;

  /**
   * @param detail The worker's error code and message.
   */
  constructor(detail: EngineError) {
    super(detail.message);
    this.detail = detail;
    this.name = "EngineCallError";
  }
}

interface Pending {
  resolve(value: unknown): void;
  reject(reason: EngineCallError): void;
}

export class EngineClient {
  private readonly pending = new Map<number, Pending>();
  private nextRequestId = 1;
  private crashed = false;
  private readonly transport: EngineTransport;

  /**
   * @param transport A started engine worker (see `spawnEngineWorker`).
   */
  constructor(transport: EngineTransport) {
    this.transport = transport;
    transport.addEventListener("message", (event) => this.settle(event.data));
    transport.addEventListener("error", () => this.failAll("The PDF engine stopped unexpectedly."));
  }

  /** True after the worker crashed; create a new client to continue. */
  get isCrashed(): boolean {
    return this.crashed;
  }

  /**
   * Sends one call to the worker.
   * @param method The protocol method.
   * @param params Its parameters.
   * @param transfer Objects to move to the worker instead of copying (file bytes).
   * @returns The pending call; its promise rejects with `EngineCallError`.
   */
  call<M extends EngineMethod>(method: M, params: EngineParams<M>, transfer: Transferable[] = []): EngineCall<EngineResult<M>> {
    const requestId = this.nextRequestId++;
    const promise = new Promise<EngineResult<M>>((resolve, reject) => {
      if (this.crashed) {
        reject(new EngineCallError({ code: "engine-failed", message: "The PDF engine is not running." }));
        return;
      }
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      this.transport.postMessage({ kind: "call", requestId, method, params } as EngineRequest, transfer);
    });
    return {
      promise,
      cancel: () => {
        if (this.pending.has(requestId)) this.transport.postMessage({ kind: "cancel", requestId }, []);
      },
    };
  }

  /** Stops the worker and rejects every pending call. */
  dispose(): void {
    this.transport.terminate();
    this.failAll("The PDF engine was shut down.");
  }

  /**
   * Resolves or rejects the call a response belongs to.
   * @param response A message from the worker.
   */
  private settle(response: EngineResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new EngineCallError(response.error));
  }

  /**
   * Marks the worker as gone and rejects everything still waiting.
   * @param message Shown to the user through the session's error state.
   */
  private failAll(message: string): void {
    this.crashed = true;
    for (const pending of this.pending.values()) pending.reject(new EngineCallError({ code: "engine-failed", message }));
    this.pending.clear();
  }
}

/**
 * Starts the engine worker. Bundlers that understand `new URL(..., import.meta.url)` (Vite does) emit it
 * as a separate chunk.
 * @returns The worker, ready to be passed to `new EngineClient()`.
 */
export function spawnEngineWorker(): Worker {
  return new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module", name: "pdf-engine" });
}
