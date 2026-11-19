/**
 * The typed protocol between the editor core (main thread) and the engine worker.
 * Every call carries a `requestId`; the reply echoes it so the client can match answers to questions
 * and cancel calls it no longer needs. This file and `pdfium-engine.ts` are the only places that know
 * which PDF engine runs behind the protocol.
 */
import type { PageSize } from "@pdf-editor/shared";

/** Identifies an open document inside the worker. */
export type DocId = string;

/** Bytes to open: fresh from a file, or held by the worker after a password prompt. */
export type OpenSource = { readonly bytes: ArrayBuffer } | { readonly lockedId: string };

export interface OpenedDocument {
  readonly docId: DocId;
  readonly pageCount: number;
  readonly pageSizes: readonly PageSize[];
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

/** Every call the worker understands: its parameters and what it resolves with. */
export interface EngineMethods {
  init: { params: { wasmUrl: string }; result: null };
  open: { params: { source: OpenSource; password?: string }; result: OpenedDocument };
  close: { params: { docId: DocId }; result: null };
  renderPage: { params: { docId: DocId; pageIndex: number; width: number; height: number; rotation?: Rotation }; result: RenderedPage };
  assemble: { params: { parts: readonly AssemblePart[] }; result: { bytes: ArrayBuffer } };
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
      [M in EngineMethod]: { readonly kind: "call"; readonly requestId: number; readonly method: M; readonly params: EngineParams<M> };
    }[EngineMethod]
  | { readonly kind: "cancel"; readonly requestId: number };

/** Messages the worker sends back. */
export type EngineResponse =
  | { readonly requestId: number; readonly ok: true; readonly result: unknown }
  | { readonly requestId: number; readonly ok: false; readonly error: EngineError };
