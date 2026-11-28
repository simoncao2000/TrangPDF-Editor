import { expect, test } from "bun:test";
import { createDocumentSession } from "@pdf-editor/core";
import { corpusFile, createTestEngine } from "../../../../core/src/testing/fixtures";
import { commitAddedText, commitPageDraft } from "./draft-commands";
import { mark, textObject } from "../../../stories/sample-data";
import { annotationTakesHit, pageHit } from "./page-hit";
import { selectWord } from "./select-word";

/** @param name The corpus document. @returns An open session and its first page. */
async function openPage(name: string) {
  const session = createDocumentSession(await createTestEngine());
  await session.load({ name, bytes: corpusFile(name) });
  return { session, page: session.store.getState().pages[0]!.id };
}

test("Select distinguishes empty paper from text and selects the clicked word", async () => {
  const { session, page } = await openPage("text.pdf");
  const point = { x: 100, y: 708 };
  expect(await pageHit(session, page, { x: 10, y: 10 })).toBeNull();
  const hit = await pageHit(session, page, point);
  if (!hit || hit === "occupied") throw new Error("Expected a page text hit");
  expect((await selectWord(session, page, point, hit)).text).toBe("Tide");
});

test("a field or annotation occupies its page rectangle", async () => {
  for (const name of ["form.pdf", "annotated.pdf"]) {
    const { session, page } = await openPage(name);
    const items = name === "form.pdf" ? await session.readFormFields(page) : await session.readAnnotations(page);
    const { x, y, width, height } = items[0]!.rect;
    expect(await pageHit(session, page, { x: x + width / 2, y: y + height / 2 })).toBe("occupied");
  }
});

test("an empty added draft creates no history entry", async () => {
  const { session, page } = await openPage("text.pdf");
  commitAddedText(session, page, [[]], { origin: { x: 10, y: 10 }, angle: 0, fontSize: 12 });
  expect(session.store.getState().status).toBe("clean");
  expect(session.store.getState().undoLabel).toBeNull();
});

test("undo restores the text at its moved position before restoring the original position", async () => {
  const { session, page } = await openPage("text.pdf");
  const from = { x: 100, y: 708 };
  const to = { x: 100, y: 608 };
  const object = (await session.textObjectAt(page, from))!;
  const runs = [{ ...object.runs![0]!, text: "Changed line" }];
  commitPageDraft(session, page, object, { delta: { x: 0, y: -100 }, runs });
  await session.settled();
  expect((await session.textObjectAt(page, to))?.text).toBe("Changed line");
  session.undo();
  expect((await session.textObjectAt(page, to))?.text).toBe(object.text);
  session.undo();
  expect((await session.textObjectAt(page, from))?.bounds).toEqual(object.bounds);
});

test("Edit text reaches a line through highlight markup while Select targets the annotation", () => {
  expect(annotationTakesHit("editText", mark, textObject)).toBe(false);
  expect(annotationTakesHit("select", mark, textObject)).toBe(true);
  expect(annotationTakesHit("highlight", mark, textObject)).toBe(true);
  expect(annotationTakesHit("editText", mark, null)).toBe(true);
});
