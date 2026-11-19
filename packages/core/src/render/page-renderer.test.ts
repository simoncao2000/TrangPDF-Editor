import { describe, expect, it } from "bun:test";
import type { EngineMethod, EngineParams, EngineResult } from "../engine/protocol";
import { PageRenderer, type RenderEngine } from "./page-renderer";
import type { CancellableWork } from "./render-queue";

/**
 * A fake engine that renders instantly and counts calls and cancels.
 * @returns The engine and its counters.
 */
function fakeEngine() {
  const stats = { renders: 0, cancels: 0 };
  const engine: RenderEngine = {
    call<M extends EngineMethod>(_method: M, params: EngineParams<M>): CancellableWork<EngineResult<M>> {
      stats.renders++;
      const { width, height } = params as EngineParams<"renderPage">;
      const bitmap = { width, height, close() {} } as unknown as ImageBitmap;
      return { promise: Promise.resolve({ bitmap, width, height } as EngineResult<M>), cancel: () => stats.cancels++ };
    },
  };
  return { engine, stats };
}

const request = { docId: "doc-1", pageIndex: 0, rotation: 0 as const, width: 100, height: 130, priority: 0 };

describe("PageRenderer", () => {
  it("serves a repeated request from the cache", async () => {
    const { engine, stats } = fakeEngine();
    const renderer = new PageRenderer(engine);
    const first = await renderer.request(request).promise;
    const second = await renderer.request(request).promise;
    expect(second).toBe(first);
    expect(stats.renders).toBe(1);
  });

  it("merges identical requests that are in flight", async () => {
    const { engine, stats } = fakeEngine();
    const renderer = new PageRenderer(engine);
    const [a, b] = await Promise.all([renderer.request(request).promise, renderer.request(request).promise]);
    expect(a).toBe(b);
    expect(stats.renders).toBe(1);
  });

  it("offers the sharpest cached size as a placeholder", async () => {
    const { engine } = fakeEngine();
    const renderer = new PageRenderer(engine);
    await renderer.request({ ...request, width: 50, height: 65 }).promise;
    const big = await renderer.request(request).promise;
    expect(renderer.bestCached("doc-1", 0, 0)).toBe(big);
  });

  it("forgets a closed document", async () => {
    const { engine } = fakeEngine();
    const renderer = new PageRenderer(engine);
    await renderer.request(request).promise;
    renderer.forgetDocument("doc-1");
    expect(renderer.bestCached("doc-1", 0, 0)).toBeUndefined();
  });

  it("starts a fresh render when a request arrives right after every waiter cancelled", async () => {
    const { engine, stats } = fakeEngine();
    const renderer = new PageRenderer(engine, { concurrency: 1 });
    const blocker = renderer.request({ ...request, pageIndex: 9 });
    const first = renderer.request(request);
    first.cancel();
    const second = renderer.request(request);
    await blocker.promise;
    await expect(second.promise).resolves.toBeDefined();
    expect(stats.renders).toBe(2);
  });
});
