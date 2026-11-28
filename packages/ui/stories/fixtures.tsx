/// <reference types="vite/client" />
import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import {
  addAnnotation,
  createDocumentSession,
  createWorkspace,
  EngineClient,
  pageFrame,
  PageRenderer,
  spawnEngineWorker,
  type PageTextObject,
} from "@pdf-editor/core";
import { createMemoryHistory, EditorProvider, EditorRouter, type EditorServices } from "../src";
import { useEffect, useState, type ReactNode } from "react";
import textPdf from "../../../test-corpus/text.pdf?url";
import formPdf from "../../../test-corpus/form.pdf?url";
import encryptedPdf from "../../../test-corpus/encrypted-harbour.pdf?url";
import { useAnnotationUi } from "../src/state/annotation-store";
import { useTextSelection } from "../src/state/text-selection-store";
import { useViewer } from "../src/state/viewer-store";
import { mark, rect, textObject } from "./sample-data";
import { useEditorServices } from "../src/editor/hooks";
import { usePageDrawInfo } from "../src/components/viewer/use-page-geometry";

export type Sample = "text" | "form" | "encrypted" | "highlighted" | "empty";
const samples = { text: textPdf, highlighted: textPdf, form: formPdf, encrypted: encryptedPdf };

/**
 * Creates a routed preview with its own worker and workspace.
 * @param props The sample document, initial route and story.
 * @returns The preview after PDFium opens the sample.
 */
export function EditorFixture({
  sample = "text",
  path = "/",
  children,
}: {
  readonly sample?: Sample;
  readonly path?: string;
  readonly children: ReactNode;
}) {
  const [services, setServices] = useState<EditorServices>();
  const [error, setError] = useState<string>();
  const [history] = useState(() => createMemoryHistory({ initialEntries: [path] }));

  useEffect(() => {
    const engine = new EngineClient(spawnEngineWorker());
    const workspace = createWorkspace(() => createDocumentSession(engine));
    let active = true;
    /** @returns Nothing once the preview is ready. */
    const load = async () => {
      await engine.call("init", { wasmUrl: new URL(wasmUrl, window.location.href).href }).promise;
      /** @returns A fresh fixture suitable for transfer to the worker. */
      const open = async () => {
        const source = samples[sample === "empty" ? "text" : sample];
        const response = await fetch(source);
        if (!response.ok) throw new Error("Could not load the sample PDF.");
        return { name: "Sample.pdf", bytes: await response.arrayBuffer() };
      };
      if (sample !== "empty") await workspace.open(await open());
      if (sample === "highlighted") {
        const session = workspace.activeSession();
        const page = session.store.getState().pages[0]!;
        session.dispatch((content) => addAnnotation(content, page.id, mark));
        await session.settled();
      }
      if (!active) return;
      setServices({
        workspace,
        renderer: new PageRenderer(engine),
        files: {
          canSaveInPlace: true,
          open,
          openDropped: open,
          /** @returns Sample history for the isolated preview. */
          listRecent: async () => [{ id: "sample", name: "Sample.pdf", openedAt: 0, pageCount: 1, canReopen: true }],
          openRecent: open,
          rememberOpened: async () => {},
          clearRecent: async () => {},
          saveTarget: async () => null,
          pickSaveTarget: async () => null,
        },
      });
    };
    void load().catch((problem: unknown) => {
      if (active) setError(String(problem));
    });
    return () => {
      active = false;
      engine.dispose();
    };
  }, [sample]);

  if (error) return <p role="alert">{error}</p>;
  if (!services) return <p role="status">Opening sample PDF…</p>;
  return (
    <EditorRouter history={history}>
      <EditorProvider services={services}>{children}</EditorProvider>
    </EditorRouter>
  );
}

type Page = ReturnType<typeof usePageDrawInfo>[number];

export interface SamplePage {
  readonly page: Page;
  readonly pages: readonly Page[];
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly frame: ReturnType<typeof pageFrame>;
}

/** @param props A renderer for the open page. @returns A positioned surface and its example. */
export function PageFixture({
  children,
  scenario,
}: {
  readonly children: (page: SamplePage) => ReactNode;
  readonly scenario?: "selection" | "search" | "editText";
}) {
  const pages = usePageDrawInfo();
  const page = pages[0];
  const pageId = page?.id;
  useEffect(() => {
    if (!pageId || !scenario) return;
    if (scenario === "editText") useAnnotationUi.getState().setTool("editText");
    if (scenario === "selection")
      useTextSelection.getState().select({
        pageId,
        rects: [rect],
        text: textObject.text,
        settled: true,
      });
    if (scenario === "search") useViewer.getState().showSearchHit({ pageId, rects: [rect] });
    return () => {
      if (scenario === "editText") useAnnotationUi.getState().setTool("select");
      if (scenario === "selection") useTextSelection.getState().select(null);
      if (scenario === "search") useViewer.getState().showSearchHit(null);
    };
  }, [pageId, scenario]);
  if (!page) return <p role="alert">The sample has no pages.</p>;
  const zoom = 0.55;
  const width = (page.size.width * zoom * 4) / 3;
  const height = (page.size.height * zoom * 4) / 3;
  const frame = pageFrame(page.sourceGeometry, page.rotation, zoom);
  return (
    <div className="bg-white relative" style={{ width, height }}>
      {children({ page, pages, width, height, zoom, frame })}
    </div>
  );
}

/** @param props The PDF page ID and renderer. @returns A preview of a real text object. */
export function TextObjectFixture({
  pageId,
  children,
}: {
  readonly pageId: string;
  readonly children: (object: PageTextObject) => ReactNode;
}) {
  const { session } = useEditorServices();
  const [object, setObject] = useState<PageTextObject>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void session.readTextObjects(pageId).then(
      ([first]) => {
        if (!active) return;
        if (first) setObject(first);
        else setError(true);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [pageId, session]);
  if (error) return <p role="alert">Could not read text from the sample PDF.</p>;
  return object ? children(object) : <p role="status">Reading sample text…</p>;
}
