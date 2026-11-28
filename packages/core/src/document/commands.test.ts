import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { deletePages, insertPages, movePages, rotatePages, type Command } from "./commands";
import type { DocumentContent, SourceDoc } from "./document-state";
import { EMPTY_HISTORY, execute, isDirty, markSaved, redo, undo, type Step } from "./history";

/**
 * A source with `count` Letter pages.
 * @param id Source id.
 * @param count Page count.
 * @returns The source.
 */
function source(id: string, count: number): SourceDoc {
  return {
    id,
    name: `${id}.pdf`,
    pageCount: count,
    pages: Array.from({ length: count }, () => ({
      cropBox: { x: 0, y: 0, width: 612, height: 792 },
      rotation: 0 as const,
    })),
    docId: `doc-${id}`,
  };
}

/**
 * Content holding one source in file order.
 * @param count Page count.
 * @returns The content.
 */
function content(count: number): DocumentContent {
  const a = source("a", count);
  return {
    sources: { a },
    pages: Array.from({ length: count }, (_, i) => ({
      id: `a:${i}`,
      source: "a",
      sourceIndex: i,
      rotation: 0 as const,
    })),
    annotationRevisions: {},
  };
}

const ids = (c: DocumentContent) => c.pages.map((page) => page.id);

describe("page commands", () => {
  it("rotates selected pages and undoes exactly", () => {
    const start = content(3);
    const command = rotatePages(["a:1"], 90);
    const rotated = command.apply(start);
    expect(rotated.pages.map((page) => page.rotation)).toEqual([0, 90, 0]);
    expect(rotatePages(["a:1"], -90).apply(rotated).pages[1]!.rotation).toBe(0);
    expect(command.undo(rotated)).toEqual(start);
  });

  it("wraps rotation around 360", () => {
    const start = content(1);
    const once = rotatePages(["a:0"], -90).apply(start);
    expect(once.pages[0]!.rotation).toBe(270);
  });

  it("moves several pages together, keeping their order", () => {
    const start = content(6);
    const moved = movePages(start, ["a:3", "a:5"], 1).apply(start);
    expect(ids(moved)).toEqual(["a:0", "a:3", "a:5", "a:1", "a:2", "a:4"]);
  });

  it("deletes pages and puts them back in place on undo", () => {
    const start = content(5);
    const command = deletePages(start, ["a:0", "a:3"]);
    const after = command.apply(start);
    expect(ids(after)).toEqual(["a:1", "a:2", "a:4"]);
    expect(command.undo(after)).toEqual(start);
  });

  it("inserts another file's pages (merge)", () => {
    const start = content(2);
    const after = insertPages(source("b", 2), 1).apply(start);
    expect(ids(after)).toEqual(["a:0", "b:0", "b:1", "a:1"]);
    expect(Object.keys(after.sources)).toEqual(["a", "b"]);
  });
});

describe("history", () => {
  it("is dirty after an edit and clean again after undoing back to the saved point", () => {
    let step: Step = { content: content(3), history: EMPTY_HISTORY };
    expect(isDirty(step.history)).toBe(false);
    step = execute(step, rotatePages(["a:0"], 90));
    expect(isDirty(step.history)).toBe(true);
    step = undo(step);
    expect(isDirty(step.history)).toBe(false);
  });

  it("stays dirty when a different edit replaces an undone one", () => {
    let step: Step = { content: content(3), history: EMPTY_HISTORY };
    step = execute(step, rotatePages(["a:0"], 90));
    step = { ...step, history: markSaved(step.history) };
    step = undo(step);
    step = execute(step, rotatePages(["a:1"], 90));
    expect(isDirty(step.history)).toBe(true);
  });

  it("clears redo when a new command runs", () => {
    let step: Step = { content: content(3), history: EMPTY_HISTORY };
    step = execute(step, rotatePages(["a:0"], 90));
    step = undo(step);
    step = execute(step, rotatePages(["a:1"], 90));
    expect(redo(step)).toBe(step);
  });
});

/** A random command, described as data so fast-check can shrink it. */
type Spec =
  | { kind: "rotate"; picks: number[]; degrees: 90 | -90 | 180 }
  | { kind: "move"; picks: number[]; to: number }
  | { kind: "delete"; picks: number[] }
  | { kind: "insert"; size: number; at: number };

/** Random command against the current content (the property test's alphabet). */
const commandArbitrary = (count: number): fc.Arbitrary<Spec> =>
  fc.oneof(
    fc.record({
      kind: fc.constant("rotate" as const),
      picks: fc.array(fc.nat(count * 2), { minLength: 1, maxLength: 4 }),
      degrees: fc.constantFrom(90 as const, -90 as const, 180 as const),
    }),
    fc.record({
      kind: fc.constant("move" as const),
      picks: fc.array(fc.nat(count * 2), { minLength: 1, maxLength: 4 }),
      to: fc.nat(count * 2),
    }),
    fc.record({
      kind: fc.constant("delete" as const),
      picks: fc.array(fc.nat(count * 2), { minLength: 1, maxLength: 3 }),
    }),
    fc.record({ kind: fc.constant("insert" as const), size: fc.integer({ min: 1, max: 3 }), at: fc.nat(count * 2) }),
  );

/**
 * Builds a real command from a random description, against the current content.
 * @param current Content now.
 * @param spec Random description.
 * @param serial Unique number for inserted sources.
 * @returns The command.
 */
function build(current: DocumentContent, spec: Spec, serial: number): Command {
  const pick = (indexes: number[]) => [
    ...new Set(
      indexes
        .map((i) => current.pages[i % Math.max(1, current.pages.length)]?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  switch (spec.kind) {
    case "rotate":
      return rotatePages(pick(spec.picks), spec.degrees);
    case "move":
      return movePages(current, pick(spec.picks), spec.to);
    case "delete":
      return deletePages(current, pick(spec.picks));
    default:
      return insertPages(source(`s${serial}`, spec.size), spec.at);
  }
}

describe("property: any sequence of page commands undoes back to the start", () => {
  it("undo all returns the original page list; redo all returns the final one", () => {
    fc.assert(
      fc.property(fc.array(commandArbitrary(8), { minLength: 1, maxLength: 25 }), (specs) => {
        const start: Step = { content: content(8), history: EMPTY_HISTORY };
        let step = start;
        specs.forEach((spec, serial) => {
          step = execute(step, build(step.content, spec, serial));
        });
        const final = step.content;
        for (let i = 0; i < specs.length; i++) step = undo(step);
        expect(step.content.pages).toEqual(start.content.pages);
        expect(isDirty(step.history)).toBe(false);
        for (let i = 0; i < specs.length; i++) step = redo(step);
        expect(step.content.pages).toEqual(final.pages);
      }),
      { numRuns: 300 },
    );
  });
});
