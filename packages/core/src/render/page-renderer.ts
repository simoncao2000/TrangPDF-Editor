/**
 * The one entry point the UI uses to get page pixels: checks the cache, merges duplicate requests,
 * queues the rest nearest-first and asks the engine worker to render them.
 */
import type { DocId, EngineMethod, EngineParams, EngineResult, Rotation } from "../engine/protocol";
import { BitmapCache, DESKTOP_CACHE_BYTES } from "./bitmap-cache";
import { RenderCancelledError, RenderQueue, type CancellableWork, type QueuedJob } from "./render-queue";

/** The engine call the renderer needs; `EngineClient` provides it. */
export interface RenderEngine {
  call<M extends EngineMethod>(method: M, params: EngineParams<M>): CancellableWork<EngineResult<M>>;
}

export interface RenderRequest {
  readonly docId: DocId;
  readonly pageIndex: number;
  /** Extra clockwise rotation from the Rotate command. */
  readonly rotation: Rotation;
  /** Device pixels, already swapped for a quarter turn. */
  readonly width: number;
  readonly height: number;
  /** Lower renders sooner; use the distance from the current page. Thumbnails add a constant. */
  readonly priority: number;
}

/** A requested render. The bitmap belongs to the cache: draw it, do not close it. */
export interface RenderTicket {
  readonly promise: Promise<ImageBitmap>;
  cancel(): void;
  setPriority(priority: number): void;
}

interface InFlight {
  readonly job: QueuedJob<ImageBitmap>;
  waiters: number;
}

export interface PageRendererOptions {
  readonly cacheBytes?: number;
  readonly concurrency?: number;
}

/**
 * Cache key prefix for one page at one rotation.
 * @param docId Document id.
 * @param pageIndex Page index.
 * @param rotation Extra rotation.
 * @returns A prefix shared by every size of that page turned that way.
 */
function pageKey(docId: DocId, pageIndex: number, rotation: Rotation): string {
  return `${docId}#${pageIndex}r${rotation}@`;
}

export class PageRenderer {
  private readonly cache: BitmapCache<ImageBitmap>;
  private readonly queue: RenderQueue;
  private readonly inFlight = new Map<string, InFlight>();
  private readonly engine: RenderEngine;

  /**
   * @param engine Something that can run `renderPage` (the engine client).
   * @param options Cache budget and concurrency.
   */
  constructor(engine: RenderEngine, options: PageRendererOptions = {}) {
    this.engine = engine;
    this.cache = new BitmapCache<ImageBitmap>(options.cacheBytes ?? DESKTOP_CACHE_BYTES);
    this.queue = new RenderQueue(options.concurrency);
  }

  /**
   * Asks for a page at an exact pixel size.
   * @param request Which page, how big and how urgent.
   * @returns A ticket; cancel it when the page leaves the view or the size changes.
   */
  request(request: RenderRequest): RenderTicket {
    const key = `${pageKey(request.docId, request.pageIndex, request.rotation)}${request.width}x${request.height}`;
    const cached = this.cache.get(key);
    if (cached) return { promise: Promise.resolve(cached), cancel: () => {}, setPriority: () => {} };

    const flight = this.inFlight.get(key) ?? this.startFlight(key, request);
    flight.waiters++;
    let released = false;
    return {
      promise: flight.job.promise,
      cancel: () => {
        if (released) return;
        released = true;
        flight.waiters--;
        if (flight.waiters > 0) return;
        // Forget the job now, so a request that arrives before it settles starts a fresh one
        // instead of sharing a cancelled render (React StrictMode mounts effects twice).
        this.forgetFlight(key, flight);
        flight.job.cancel();
      },
      setPriority: (priority) => flight.job.setPriority(priority),
    };
  }

  /**
   * The sharpest bitmap already cached for a page, at any size. Stretch it as a placeholder
   * while the exact size renders.
   * @param docId Document id.
   * @param pageIndex Page index.
   * @param rotation Extra rotation (a copy at another rotation would have the wrong shape).
   * @returns A bitmap or `undefined`.
   */
  bestCached(docId: DocId, pageIndex: number, rotation: Rotation): ImageBitmap | undefined {
    return this.cache.largestWithPrefix(pageKey(docId, pageIndex, rotation));
  }

  /**
   * Drops every cached bitmap of a document (call when it closes).
   * @param docId Document id.
   */
  forgetDocument(docId: DocId): void {
    this.cache.deleteByPrefix(`${docId}#`);
  }

  /**
   * Queues a render and tracks it so identical requests can share it.
   * @param key Cache key for the exact size.
   * @param request The render request.
   * @returns The new in-flight entry.
   */
  private startFlight(key: string, request: RenderRequest): InFlight {
    const job = this.queue.enqueue(() => this.renderNow(request), request.priority);
    const flight: InFlight = { job, waiters: 0 };
    this.inFlight.set(key, flight);
    job.promise.then(
      (bitmap) => {
        if (this.inFlight.get(key) === flight) this.cache.set(key, bitmap);
        else bitmap.close(); // nobody is waiting for it any more
      },
      () => {},
    );
    job.promise.finally(() => this.forgetFlight(key, flight)).catch(() => {});
    return flight;
  }

  /**
   * Removes an in-flight entry if it is still the current one for its key.
   * @param key Cache key.
   * @param flight The entry to remove.
   */
  private forgetFlight(key: string, flight: InFlight): void {
    if (this.inFlight.get(key) === flight) this.inFlight.delete(key);
  }

  /**
   * Starts the worker call for a queued job.
   * @param request The render request.
   * @returns The cancellable bitmap result.
   */
  private renderNow(request: RenderRequest): CancellableWork<ImageBitmap> {
    const call = this.engine.call("renderPage", {
      docId: request.docId,
      pageIndex: request.pageIndex,
      width: request.width,
      height: request.height,
      rotation: request.rotation,
    });
    return { promise: call.promise.then((rendered) => rendered.bitmap), cancel: () => call.cancel() };
  }
}

export { RenderCancelledError };
