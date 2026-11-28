import { expect, it } from "bun:test";
import { measureSource, runFitRatio } from "./run-fit";

it("expands and contracts a browser run to its PDF width", () => {
  expect(runFitRatio(72, 60)).toBe(1.2);
  expect(runFitRatio(72, 90)).toBe(0.8);
  expect(runFitRatio(72, 72)).toBe(1);
  expect(runFitRatio(72, 0)).toBe(1);
});

it("fits each source run to its own original width", () => {
  let next = 0;
  const ctx = {
    font: "",
    measureText: () => {
      const width = [6, 24][next++]!;
      return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width } as TextMetrics;
    },
  } as unknown as CanvasRenderingContext2D;
  const source = measureSource(ctx, [
    { text: "ab", font: "12px serif", originalWidth: 12 },
    { text: "cd", font: "12px sans-serif", originalWidth: 24 },
  ]);

  expect(source.map(({ ratio }) => ratio)).toEqual([2, 1]);
});

it("keeps an edited run's original ratio when its text length changes", () => {
  const ratio = runFitRatio(36, 18);
  expect(18 * ratio).toBe(36);
  expect(45 * ratio).toBe(90);
});
