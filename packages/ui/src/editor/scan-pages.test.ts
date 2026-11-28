import { expect, it } from "bun:test";
import { scanPages } from "./scan-pages";

const pages = Array.from({ length: 1000 }, (_, i) => i);

it("publishes every page in document order", async () => {
  expect(await scanPages(pages, async (page) => page, new AbortController().signal)).toEqual(pages);
});

it("stops scheduling after cancellation and discards the partial batch", async () => {
  const controller = new AbortController();
  const started: number[] = [];
  const result = await scanPages(
    pages,
    async (page) => {
      started.push(page);
      if (page === 0) queueMicrotask(() => controller.abort());
      return page;
    },
    controller.signal,
  );
  expect(result).toBeUndefined();
  expect(started).toEqual(pages.slice(0, 8));
});
