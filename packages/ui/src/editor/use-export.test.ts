import { EMPTY_DOCUMENT, type DocumentState, type FormField, type PageRef } from "@pdf-editor/core";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createStore } from "zustand/vanilla";
import { useExport, type ExportScope } from "./use-export";

const text: FormField = {
  id: "name",
  name: "Full name",
  kind: "text",
  rect: { x: 0, y: 0, width: 10, height: 10 },
  value: "",
  checked: false,
  exportValue: "",
  options: [],
  required: true,
  readOnly: false,
  multiline: false,
  fontName: "",
  fontSize: 0,
  textColor: { r: 0, g: 0, b: 0 },
  textInset: 1,
};

const optional = { ...text, id: "notes", name: "Notes", required: false };

/**
 * @param perPage Widgets to return for each page in the fixture.
 * @returns The document services needed by export validation.
 */
function fixture(perPage: readonly (readonly FormField[])[]) {
  const pages = perPage.map((_, index): PageRef => ({
    id: String(index),
    source: "fixture",
    sourceIndex: index,
    rotation: 0,
  }));
  return {
    store: createStore<DocumentState>(() => ({ ...EMPTY_DOCUMENT, pages })),
    readFormFields: mock(async (id: string) => perPage[Number(id)] ?? []),
  };
}

/**
 * @param session The document to export.
 * @param scope The initial page scope.
 * @returns The request after its preflight settles.
 */
async function requestExport(session: ReturnType<typeof fixture>, scope: ExportScope = "all") {
  const { open, check } = useExport.getState();
  open(scope);
  const { request } = useExport.getState();
  if (request?.stage !== "requested") throw new Error("Expected an export request");
  await check(request, session);
  return useExport.getState().request;
}

afterEach(() => useExport.getState().close());

describe("export preflight", () => {
  it("allows documents without fields and forms with no missing required answers", async () => {
    expect(await requestExport(fixture([[]]))).toMatchObject({ stage: "ready", scope: "all" });
    const filled = { ...text, value: "A name" };
    const button = { ...text, id: "submit", name: "Submit", kind: "button" } as const;
    expect(await requestExport(fixture([[optional, filled, button]]))).toMatchObject({ stage: "ready" });
  });

  it("checks every page and picks the first missing required field in page order", async () => {
    const radio = { ...text, id: "a", name: "Visit", kind: "radio" } as const;
    const selected = { ...radio, id: "b", checked: true };
    const blank = { ...text, value: "  " };
    const checkbox = { ...text, id: "check", name: "Consent", kind: "checkbox", value: "Off" } as const;
    const request = await requestExport(
      fixture([
        [optional, radio],
        [selected, blank, checkbox],
      ]),
      "selected",
    );
    expect(request).toMatchObject({ stage: "blocked", scope: "selected", first: { name: text.name, pageId: "1" } });
    expect(await requestExport(fixture([[checkbox]]))).toMatchObject({
      stage: "blocked",
      first: { name: "Consent", pageId: "0" },
    });
  });

  it("opens the original scope once when the user chooses Export anyway", async () => {
    const session = fixture([[text]]);
    const request = await requestExport(session, "selected");
    if (request?.stage !== "blocked") throw new Error("Expected a blocked export");

    const { exportAnyway } = useExport.getState();
    exportAnyway(request);
    expect(useExport.getState().request).toMatchObject({ stage: "ready", scope: "selected" });
    expect(session.readFormFields).toHaveBeenCalledTimes(1);

    await requestExport(session);
    exportAnyway(request);
    expect(useExport.getState().request).toMatchObject({ stage: "blocked", scope: "all" });
  });
});
