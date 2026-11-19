/**
 * Owns the document state, its undo history and the open/edit/save lifecycle (architecture §6.2–6.3,
 * §7.3). Talks to the engine worker; never imports React or a platform. The UI reads `store` and calls
 * the methods; every edit goes through `dispatch` so it can be undone.
 */
import { err, ok, type OpenErrorKind, type OpenedFile, type Result, type SavedFile } from "@pdf-editor/shared";
import { createStore, type StoreApi } from "zustand/vanilla";
import { EngineCallError } from "../engine/engine-client";
import type { AssemblePart, EngineErrorCode, EngineMethod, EngineParams, EngineResult, OpenSource } from "../engine/protocol";
import type { CancellableWork } from "../render/render-queue";
import { inspectPdfBytes } from "../validate";
import type { Command } from "./commands";
import { EMPTY_DOCUMENT, docIdOf, type DocumentContent, type DocumentState, type PageRef, type SourceDoc } from "./document-state";
import { EMPTY_HISTORY, execute, isDirty, markSaved, redo, undo, type History } from "./history";

/** The engine calls the session needs; `EngineClient` provides them. */
export interface SessionEngine {
  call<M extends EngineMethod>(method: M, params: EngineParams<M>, transfer?: Transferable[]): CancellableWork<EngineResult<M>>;
}

/** Writes finished bytes somewhere (the UI passes a FileAdapter call). Resolves `null` if cancelled. */
export type SaveWriter = (bytes: ArrayBuffer) => Promise<SavedFile | null>;

export type SaveResult = { readonly saved: true; readonly file: SavedFile } | { readonly saved: false; readonly reason: "cancelled" | "build-failed" | "write-failed" };

/** A command, or a function that builds one from the current content (for commands that remember it). */
export type CommandInput = Command | ((content: DocumentContent) => Command);

export interface DocumentSession {
  /** Subscribe with zustand's `useStore(session.store, selector)` in React. */
  readonly store: StoreApi<DocumentState>;
  /**
   * Opens a file, replacing any open document. Ask the user about unsaved changes first.
   * @param file The file from a FileAdapter. Its bytes are moved to the worker.
   * @returns Resolves when the file is open, waiting for a password, or failed.
   */
  load(file: OpenedFile): Promise<void>;
  /**
   * Retries an encrypted file with a password.
   * @param password What the user typed.
   * @returns Resolves when the file opened or the password was rejected.
   */
  submitPassword(password: string): Promise<void>;
  /** Closes the document and returns to `empty`. Ask the user about unsaved changes first. */
  close(): Promise<void>;
  /**
   * Runs an edit and records it for undo.
   * @param input The command, or a builder that receives the current content.
   */
  dispatch(input: CommandInput): void;
  /** Undoes the newest edit. */
  undo(): void;
  /** Re-applies the newest undone edit. */
  redo(): void;
  /**
   * Sets the selected pages.
   * @param pageIds Page ids; unknown ids are dropped and the rest are put in page order.
   */
  select(pageIds: readonly string[]): void;
  /**
   * Opens another file as a source for a merge, without changing the document yet. Dispatch
   * `insertPages(source, index)` to add its pages.
   * @param file The file to insert.
   * @returns The opened source, or why it could not be opened.
   */
  importSource(file: OpenedFile): Promise<Result<SourceDoc, OpenErrorKind>>;
  /**
   * Closes a source opened with `importSource` that was not inserted after all.
   * @param source The source to let go of; ignored if the document uses it.
   */
  releaseSource(source: SourceDoc): Promise<void>;
  /**
   * Builds a PDF from pages of the document, in document order (for Extract).
   * @param pageIds Pages to include; all pages when omitted.
   * @returns The verified bytes.
   */
  buildPdf(pageIds?: readonly string[]): Promise<ArrayBuffer>;
  /**
   * Builds the document, verifies it and hands it to `write` (architecture figure 6). On success the
   * current state becomes the saved point and the file name follows the written file.
   * @param write Where to put the bytes (save in place, or save as).
   * @returns Whether it was saved, and why not.
   */
  save(write: SaveWriter): Promise<SaveResult>;
}

/**
 * Maps an engine failure to what the user is told.
 * @param code The engine's error code.
 * @returns The matching open error.
 */
function toOpenError(code: EngineErrorCode): OpenErrorKind {
  if (code === "password-required" || code === "wrong-password" || code === "damaged") return code;
  return "engine-failed";
}

/**
 * Page references for a freshly opened file, in file order.
 * @param source The opened source.
 * @returns One reference per page.
 */
function pagesOf(source: SourceDoc): PageRef[] {
  return Array.from({ length: source.pageCount }, (_, sourceIndex) => ({ id: `${source.id}:${sourceIndex}`, source: source.id, sourceIndex, rotation: 0 }));
}

/**
 * The engine instructions for building a file from pages.
 * @param content Sources and pages.
 * @param pages The pages to include, in order.
 * @returns One part per page.
 */
function partsOf(content: DocumentContent, pages: readonly PageRef[]): AssemblePart[] {
  return pages.map((page) => ({ docId: docIdOf(content, page) ?? "", pageIndex: page.sourceIndex, rotation: page.rotation }));
}

/**
 * Creates a document session.
 * @param engine The engine client (already initialised with the wasm URL).
 * @returns The session.
 */
export function createDocumentSession(engine: SessionEngine): DocumentSession {
  const store = createStore<DocumentState>(() => EMPTY_DOCUMENT);
  let history: History = EMPTY_HISTORY;
  /** Bumped on every load/close so a slow open cannot overwrite a newer one. */
  let generation = 0;
  let nextSourceNumber = 1;
  /** Where the worker is holding an encrypted file's bytes, plus what is needed to finish opening it. */
  let locked: { lockedId: string; name: string; fileId: string | null } | null = null;

  /** Writes content and history into the store, deriving status, selection and undo labels. */
  const commit = (content: DocumentContent, nextHistory: History, extra: Partial<DocumentState> = {}): void => {
    history = nextHistory;
    const current = store.getState();
    const pageIds = new Set(content.pages.map((page) => page.id));
    store.setState({
      ...current,
      ...content,
      selection: current.selection.filter((id) => pageIds.has(id)),
      status: isDirty(history) ? "dirty" : "clean",
      undoLabel: history.undoStack.at(-1)?.label ?? null,
      redoLabel: history.redoStack.at(-1)?.label ?? null,
      ...extra,
    });
  };

  const contentOf = (state: DocumentState): DocumentContent => ({ sources: state.sources, pages: state.pages });
  /** Edits are allowed only on an open document that is not being saved. */
  const editable = (): boolean => {
    const { status } = store.getState();
    return status === "clean" || status === "dirty";
  };

  const closeSources = async (sources: Readonly<Record<string, SourceDoc>>): Promise<void> => {
    await Promise.allSettled(Object.values(sources).map((source) => engine.call("close", { docId: source.docId }).promise));
  };

  const buildPdf = async (pageIds?: readonly string[]): Promise<ArrayBuffer> => {
    const state = store.getState();
    const wanted = pageIds ? new Set(pageIds) : null;
    const pages = wanted ? state.pages.filter((page) => wanted.has(page.id)) : state.pages;
    const { bytes } = await engine.call("assemble", { parts: partsOf(contentOf(state), pages) }).promise;
    return bytes;
  };

  const openInEngine = (source: OpenSource, password: string | undefined, transfer: Transferable[]) =>
    engine.call("open", { source, password }, transfer).promise;

  const open = async (name: string, fileId: string | null, source: OpenSource, password: string | undefined, transfer: Transferable[]): Promise<void> => {
    const attempt = ++generation;
    store.setState({ ...EMPTY_DOCUMENT, status: "loading", fileName: name, fileId });
    try {
      const opened = await openInEngine(source, password, transfer);
      if (attempt !== generation) return void engine.call("close", { docId: opened.docId });
      const sourceDoc: SourceDoc = { id: `source-${nextSourceNumber++}`, name, pageCount: opened.pageCount, pageSizes: opened.pageSizes, docId: opened.docId };
      locked = null;
      commit({ sources: { [sourceDoc.id]: sourceDoc }, pages: pagesOf(sourceDoc) }, EMPTY_HISTORY, { fileName: name, fileId, selection: [], error: null });
    } catch (error) {
      if (attempt !== generation) return;
      const detail = error instanceof EngineCallError ? error.detail : null;
      const kind = toOpenError(detail?.code ?? "engine-failed");
      if (detail?.lockedId && (kind === "password-required" || kind === "wrong-password")) {
        locked = { lockedId: detail.lockedId, name, fileId };
        store.setState({ ...EMPTY_DOCUMENT, status: "needsPassword", fileName: name, fileId, error: kind === "wrong-password" ? kind : null });
        return;
      }
      store.setState({ ...EMPTY_DOCUMENT, status: "failed", fileName: name, fileId, error: kind });
    }
  };

  return {
    store,

    async load(file) {
      await closeSources(store.getState().sources);
      locked = null;
      history = EMPTY_HISTORY;
      const problem = inspectPdfBytes(file.bytes);
      if (problem) {
        generation++;
        store.setState({ ...EMPTY_DOCUMENT, status: "failed", fileName: file.name, error: problem });
        return;
      }
      await open(file.name, file.fileId ?? null, { bytes: file.bytes }, undefined, [file.bytes]);
    },

    async submitPassword(password) {
      if (!locked) return;
      await open(locked.name, locked.fileId, { lockedId: locked.lockedId }, password, []);
    },

    async close() {
      generation++;
      locked = null;
      history = EMPTY_HISTORY;
      const { sources } = store.getState();
      store.setState(EMPTY_DOCUMENT);
      await closeSources(sources);
    },

    dispatch(input) {
      if (!editable()) return;
      const current = contentOf(store.getState());
      const command = typeof input === "function" ? input(current) : input;
      const step = execute({ content: current, history }, command);
      commit(step.content, step.history);
    },

    undo() {
      if (!editable()) return;
      const step = undo({ content: contentOf(store.getState()), history });
      commit(step.content, step.history);
    },

    redo() {
      if (!editable()) return;
      const step = redo({ content: contentOf(store.getState()), history });
      commit(step.content, step.history);
    },

    select(pageIds) {
      const wanted = new Set(pageIds);
      const selection = store.getState().pages.filter((page) => wanted.has(page.id)).map((page) => page.id);
      const current = store.getState().selection;
      // Same selection: skip the update so nothing re-renders.
      if (selection.length === current.length && selection.every((id, i) => id === current[i])) return;
      store.setState({ selection });
    },

    async importSource(file) {
      const problem = inspectPdfBytes(file.bytes);
      if (problem) return err(problem);
      try {
        const opened = await openInEngine({ bytes: file.bytes }, undefined, [file.bytes]);
        return ok({ id: `source-${nextSourceNumber++}`, name: file.name, pageCount: opened.pageCount, pageSizes: opened.pageSizes, docId: opened.docId });
      } catch (error) {
        return err(toOpenError(error instanceof EngineCallError ? error.detail.code : "engine-failed"));
      }
    },

    async releaseSource(source) {
      if (store.getState().sources[source.id]) return;
      await engine.call("close", { docId: source.docId }).promise.catch(() => {});
    },

    buildPdf,

    async save(write) {
      if (!editable()) return { saved: false, reason: "build-failed" };
      // Status "saving" disables editing (architecture §6.3), so the history cannot change meanwhile.
      const before = store.getState().status;
      store.setState({ status: "saving" });
      let bytes: ArrayBuffer;
      try {
        bytes = await buildPdf();
      } catch {
        store.setState({ status: before });
        return { saved: false, reason: "build-failed" };
      }
      let file: SavedFile | null;
      try {
        file = await write(bytes);
      } catch {
        store.setState({ status: before });
        return { saved: false, reason: "write-failed" };
      }
      if (!file) {
        store.setState({ status: before });
        return { saved: false, reason: "cancelled" };
      }
      commit(contentOf(store.getState()), markSaved(history), { fileName: file.name, fileId: file.fileId ?? null });
      return { saved: true, file };
    },
  };
}
