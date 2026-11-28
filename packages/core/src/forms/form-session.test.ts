/** Form reads and commands through a real session and a real engine. */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createDocumentSession, type DocumentSession } from "../document/document-session";
import { pageAddressOf } from "../document/document-state";
import type { EngineClient } from "../engine/engine-client";
import { corpusFile, createTestEngine } from "../testing/fixtures";
import { setFieldValue } from "./form-commands";

describe("forms in a session", () => {
  let engine: EngineClient;
  let session: DocumentSession;
  let pageId: string;

  beforeAll(async () => {
    engine = await createTestEngine();
  });

  beforeEach(async () => {
    session = createDocumentSession(engine);
    await session.load({ name: "form.pdf", bytes: corpusFile("form.pdf") });
    pageId = session.store.getState().pages[0]!.id;
  });

  afterEach(async () => {
    await session.close();
  });

  it("lists all six widgets and caches the page revision", async () => {
    const fields = await session.readFormFields(pageId);
    expect(fields.map(({ name, kind }) => [name, kind])).toEqual([
      ["full_name", "text"],
      ["contact", "checkbox"],
      ["visit", "radio"],
      ["visit", "radio"],
      ["site", "choice"],
      ["alternate_site", "choice"],
    ]);
    expect(await session.readFormFields(pageId)).toBe(fields);
  });

  it("reads the new text value after an edit, undo, and redo", async () => {
    const before = await session.readFormFields(pageId);
    const widget = before.find(({ name }) => name === "full_name")!;
    expect(widget.value).toBe("");

    session.dispatch((content) => setFieldValue(content, pageId, widget, "Minh N."));
    const after = await session.readFormFields(pageId);
    expect(after.find(({ id }) => id === widget.id)?.value).toBe("Minh N.");

    const at = pageAddressOf(session.store.getState(), pageId)!;
    session.undo();
    expect(await session.readFormFields(pageId)).toBe(before);
    expect((await engine.call("getFormFields", at).promise).find(({ id }) => id === widget.id)?.value).toBe("");

    session.redo();
    expect(await session.readFormFields(pageId)).toBe(after);
    expect((await engine.call("getFormFields", at).promise).find(({ id }) => id === widget.id)?.value).toBe("Minh N.");
  });

  it("restores the original radio selection on undo", async () => {
    const before = await session.readFormFields(pageId);
    const returning = before.find(({ name, exportValue }) => name === "visit" && exportValue === "returning")!;
    expect(returning.value).toBe("first");

    session.dispatch((content) => setFieldValue(content, pageId, returning, "returning"));
    const after = await session.readFormFields(pageId);
    expect(after.find(({ name, checked }) => name === "visit" && checked)?.value).toBe("returning");

    session.undo();
    expect(await session.readFormFields(pageId)).toBe(before);
    const at = pageAddressOf(session.store.getState(), pageId)!;
    const restored = await engine.call("getFormFields", at).promise;
    expect(restored.find(({ name, checked }) => name === "visit" && checked)?.value).toBe("first");
  });

  it("restores an empty choice on undo", async () => {
    const before = await session.readFormFields(pageId);
    const widget = before.find(({ name }) => name === "alternate_site")!;
    expect(widget.value).toBe("");

    session.dispatch((content) => setFieldValue(content, pageId, widget, "Dunes"));
    const after = await session.readFormFields(pageId);
    expect(after.find(({ id }) => id === widget.id)?.value).toBe("Dunes");

    session.undo();
    const at = pageAddressOf(session.store.getState(), pageId)!;
    const restored = await engine.call("getFormFields", at).promise;
    expect(restored.find(({ id }) => id === widget.id)?.value).toBe("");
    expect(session.store.getState().failedEdit).toBeNull();
  });
});
