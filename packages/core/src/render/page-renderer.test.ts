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

const request = {
  docId: "doc-1",
  pageIndex: 0,
  rotation: 0 as const,
  hideEditable: false,
  revision: 0,
  width: 100,
  height: 130,
  priority: 0,
};
const image = { docId: "doc-1", pageIndex: 0, rotation: 0 as const, hideEditable: false };

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
    expect(renderer.bestCached(image)).toBe(big);
  });

  it("forgets a closed document", async () => {
    const { engine } = fakeEngine();
    const renderer = new PageRenderer(engine);
    await renderer.request(request).promise;
    renderer.forgetDocument("doc-1");
    expect(renderer.bestCached(image)).toBeUndefined();
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

  it("renders again when the page's annotations change, and keeps the old picture as a stand-in", async () => {
    const { engine, stats } = fakeEngine();
    const renderer = new PageRenderer(engine);
    const old = await renderer.request(request).promise;
    await renderer.request({ ...request, revision: 7 }).promise;
    expect(stats.renders).toBe(2);
    expect(renderer.bestCached(image)).toBeDefined();
    expect(old).toBeDefined();
  });

  it("keeps pictures with and without the editor's annotations apart, and tells the engine which", async () => {
    const seen: (boolean | undefined)[] = [];
    const { engine } = fakeEngine();
    const spy: RenderEngine = {
      call(method, params) {
        seen.push((params as EngineParams<"renderPage">).hideEditable);
        return engine.call(method, params);
      },
    };
    const renderer = new PageRenderer(spy);
    await renderer.request(request).promise;
    await renderer.request({ ...request, hideEditable: true }).promise;
    expect(seen).toEqual([false, true]);
    expect(renderer.bestCached({ ...image, hideEditable: true })).toBeDefined();
  });
});
