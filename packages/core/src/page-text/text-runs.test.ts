import { expect, it } from "bun:test";
import { layoutTextRuns, type TextRun } from "./page-text";

it("advances along a turned baseline, carrying run styles and using the largest size for line pitch", () => {
  const first: TextRun = {
    text: "First ",
    fontFamily: "Courier",
    fontSize: 10,
    bold: true,
    italic: false,
    underline: true,
    color: { r: 0, g: 0, b: 0 },
  };
  const second: TextRun = {
    ...first,
    text: "second",
    fontFamily: "Times",
    fontSize: 20,
    bold: false,
    italic: true,
    underline: false,
    color: { r: 10, g: 20, b: 30 },
  };
  const positioned = layoutTextRuns(
    [{ runs: [first, second] }, { runs: [] }, { runs: [first] }],
    { origin: { x: 72, y: 100 }, angle: 90, fontSize: 10 },
    (run) => (run === first ? 36 : 49),
  );
  expect(positioned).toEqual([
    { run: first, origin: { x: 72, y: 100 }, advance: 36 },
    { run: second, origin: { x: 72, y: 136 }, advance: 49 },
    { run: first, origin: { x: 106.5, y: 100 }, advance: 36 },
  ]);
});
