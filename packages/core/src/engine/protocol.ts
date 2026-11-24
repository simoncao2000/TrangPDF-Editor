/**
 * The typed protocol between the editor core (main thread) and the engine worker.
 * Every call carries a `requestId`; the reply echoes it so the client can match answers to questions
 * and cancel calls it no longer needs. This file and `pdfium-engine.ts` are the only places that know
 * which PDF engine runs behind the protocol.
 */
import type { PdfPoint, PdfRect, TextRunFontCheck } from "@pdf-editor/shared";
import type { Annotation, EditableAnnotation } from "../annotations/annotation";
import type { CommentReply } from "../annotations/comment";
export type { CommentInk, CommentReply, CommentSegment } from "../annotations/comment";
import type { FormField } from "../forms/form-field";
import type {
  NewTextLine,
  NewTextStyle,
  PageFont,
  PageTextObject,
  TextMatch,
  TextRun,
  TextRunLineLayout,
  TextRunPlacement,
  TextSelection,
} from "../page-text/page-text";

/** Identifies an open document inside the worker. */
export type DocId = string;

/** Bytes to open: fresh from a file, or held by the worker after a password prompt. */
export type OpenSource = { readonly bytes: ArrayBuffer } | { readonly lockedId: string };

/** Where a page's visible area sits in PDF space, and how the file itself turns it. */
export interface PageGeometry {
  /** The crop box (the media box when there is none), before rotation. */
  readonly cropBox: PdfRect;
  /** The page's own clockwise rotation, from the file. */
  readonly rotation: Rotation;
}

export interface OpenedDocument {
  readonly docId: DocId;
  readonly pageCount: number;
  readonly pages: readonly PageGeometry[];
}

/** One rendered page, transferred (not copied) from the worker. */
export interface RenderedPage {
  readonly bitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/** One page of a file being built: which page of which open document, turned by how much extra. */
export interface AssemblePart {
  readonly docId: DocId;
  readonly pageIndex: number;
  readonly rotation: Rotation;
}

/** How a new file is built. */
export interface AssembleOptions {
  /** Draw annotations and form fields into the pages, so they can no longer be edited. */
  readonly flatten?: boolean;
}

/** One page of an open document. */
export interface PageAddress {
  readonly docId: DocId;
  readonly pageIndex: number;
}

/** Every call the worker understands: its parameters and what it resolves with. */
export interface EngineMethods {
  init: { params: { wasmUrl: string }; result: null };
  open: { params: { source: OpenSource; password?: string }; result: OpenedDocument };
  close: { params: { docId: DocId }; result: null };
  /** `hideEditable` leaves out the annotations the editor draws in its own layer. */
  renderPage: {
    params: {
      docId: DocId;
      pageIndex: number;
      width: number;
      height: number;
      rotation?: Rotation;
      hideEditable?: boolean;
    };
    result: RenderedPage;
  };
  getAnnotations: { params: PageAddress & { plainOnly?: boolean }; result: Annotation[] };
  getFormFields: { params: PageAddress; result: FormField[] };
  /** Sets a field value through the widget with the given id. */
  setFormField: { params: PageAddress & { id: string; value: string }; result: null };
  /** Creates or updates an annotation; resolves with it as stored. */
  putAnnotation: {
    params: PageAddress & { annotation: EditableAnnotation; editComment?: boolean };
    result: Annotation;
  };
  /** Creates or updates a reply to an annotation. Remove and restore it like an annotation. */
  putReply: { params: PageAddress & { parentId: string; reply: CommentReply }; result: null };
  removeAnnotation: { params: PageAddress & { id: string }; result: null };
  restoreAnnotation: { params: PageAddress & { id: string }; result: null };
  /** The text between two points, one rectangle per line (for highlights). */
  getTextRects: { params: PageAddress & { from: PdfPoint; to: PdfPoint }; result: PdfRect[] };
  /** The text between two points: line rectangles and characters (selecting text to copy). */
  getTextSelection: { params: PageAddress & { from: PdfPoint; to: PdfPoint }; result: TextSelection };
  /** Finds a query on some pages of a document (case-insensitive), up to `limit` matches. */
  findText: {
    params: { docId: DocId; pageIndexes: readonly number[]; query: string; limit: number };
    result: TextMatch[];
  };
  /** Every visible text object on a page, for editing the page's text. */
  getTextObjects: { params: PageAddress; result: PageTextObject[] };
  /** The page text object under a point, or `null`. */
  getTextObjectAt: { params: PageAddress & { point: PdfPoint }; result: PageTextObject | null };
  /** Replaces a text object's text; the original is switched off and the replacement gets `newId`. */
  replacePageText: { params: PageAddress & { id: string; newId: string; text: string }; result: null };
  /** Commits one line edit, identified by an opaque history key. */
  editPageText: {
    params: PageAddress & { id: string; editId: string; runs: readonly TextRun[] };
    result: TextRunFontCheck;
  };
  togglePageTextEdit: { params: PageAddress & { editId: string; applied: boolean }; result: null };
  dropPageTextEdit: { params: PageAddress & { editId: string }; result: null };
  checkPageTextFont: {
    params: PageAddress & { run: TextRun; includeFallback?: boolean };
    result: TextRunFontCheck & { needsFallback?: true };
  };
  getPageFonts: { params: PageAddress; result: PageFont[] };
  prepareFont: { params: { bytes: ArrayBuffer }; result: ArrayBuffer };
  releaseTextFont: { params: { fontId: string }; result: null };
  registerTextFont: { params: { docId: DocId; fontId: string; bytes?: ArrayBuffer }; result: null };
  /** Adds page text with one id per run and one per underline. */
  addPageText: {
    params: PageAddress & { ids: readonly string[] } & (
        (NewTextStyle & { lines: readonly NewTextLine[] }) | (TextRunPlacement & { runs: readonly TextRunLineLayout[] })
      );
    result: null;
  };
  /** Moves a page text object by a distance in PDF space. */
  movePageText: { params: PageAddress & { id: string; dx: number; dy: number }; result: null };
  /** Draws one page text object on a transparent background (for dragging it). */
  renderTextObject: { params: PageAddress & { id: string; scale: number }; result: RenderedPage };
  /** Switches page text objects on and off (undo and redo of text edits). */
  showPageText: { params: PageAddress & { show: readonly string[]; hide: readonly string[] }; result: null };
  assemble: { params: { parts: readonly AssemblePart[] } & AssembleOptions; result: { bytes: ArrayBuffer } };
}

export type EngineMethod = keyof EngineMethods;
export type EngineParams<M extends EngineMethod> = EngineMethods[M]["params"];
export type EngineResult<M extends EngineMethod> = EngineMethods[M]["result"];

export type EngineErrorCode =
  | "password-required"
  | "wrong-password"
  | "damaged"
  | "unknown-document"
  | "cancelled"
  | "not-initialized"
  | "assemble-failed"
  | "unknown-annotation"
  | "annotation-failed"
  | "rich-comment-too-large"
  | "form-field-write-failed"
  | "invalid-text-runs"
  | "text-edit-failed"
  | "engine-failed";

export interface EngineError {
  readonly code: EngineErrorCode;
  readonly message: string;
  /** Set on password errors: pass it back as `{ lockedId }` so the file is not sent twice. */
  readonly lockedId?: string;
}

/** Messages the core sends to the worker. */
export type EngineRequest =
  | {
      [M in EngineMethod]: {
        readonly kind: "call";
        readonly requestId: number;
        readonly method: M;
        readonly params: EngineParams<M>;
      };
    }[EngineMethod]
  | { readonly kind: "cancel"; readonly requestId: number };

/** Messages the worker sends back. */
export type EngineResponse =
  | { readonly requestId: number; readonly ok: true; readonly result: unknown }
  | { readonly requestId: number; readonly ok: false; readonly error: EngineError };
