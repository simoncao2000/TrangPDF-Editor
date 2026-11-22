/**
 * Annotation commands (architecture §6.2: AddAnnotation, EditAnnotation). PDFium holds the
 * annotations, so each command changes the page's annotation revision in the content and does the
 * real work in the engine. Undo of a delete restores the very same annotation, which also works for
 * annotations made by other apps.
 */
import type { Command, CommandEngine } from "../document/commands";
import type { DocumentContent } from "../document/document-state";
import { pageEditCommand } from "../document/page-edit-command";
import type { PageAddress } from "../engine/protocol";
import type { Annotation, AnnotationKind, EditableAnnotation } from "./annotation";

const KIND_LABELS: Record<AnnotationKind, string> = {
  highlight: "highlight",
  ink: "drawing",
  square: "rectangle",
  textBox: "text box",
  other: "annotation",
};

/**
 * Adds an annotation to a page.
 * @param content The current content.
 * @param pageId The page.
 * @param annotation The new annotation, with a fresh id.
 * @returns The command.
 */
export function addAnnotation(content: DocumentContent, pageId: string, annotation: EditableAnnotation): Command {
  return pageEditCommand(content, pageId, `Add ${KIND_LABELS[annotation.kind]}`, {
    apply: (engine, at) => engine("putAnnotation", { ...at, annotation }),
    undo: (engine, at) => engine("removeAnnotation", { ...at, id: annotation.id }),
  });
}

/**
 * Changes an annotation: moves it, resizes it, or sets its properties.
 * @param content The current content.
 * @param pageId The page.
 * @param before The annotation as it is now.
 * @param after The annotation as it should be, with the same id.
 * @returns The command.
 */
export function editAnnotation(
  content: DocumentContent,
  pageId: string,
  before: EditableAnnotation,
  after: EditableAnnotation,
): Command {
  return pageEditCommand(content, pageId, `Edit ${KIND_LABELS[after.kind]}`, {
    apply: (engine, at) => engine("putAnnotation", { ...at, annotation: after }),
    undo: (engine, at) => engine("putAnnotation", { ...at, annotation: before }),
  });
}

/**
 * Deletes annotations from a page, of any kind.
 * @param content The current content.
 * @param pageId The page.
 * @param annotations The annotations to delete.
 * @returns The command.
 */
export function deleteAnnotations(
  content: DocumentContent,
  pageId: string,
  annotations: readonly Annotation[],
): Command {
  // Replies go with the markup they answer, and come back with it.
  const ids = annotations.flatMap((annotation) => [
    annotation.id,
    ...(annotation.replies ?? []).map((reply) => reply.id),
  ]);
  const label =
    annotations.length === 1
      ? `Delete ${KIND_LABELS[annotations[0]!.kind]}`
      : `Delete ${annotations.length} annotations`;
  // Every call is sent before any is awaited, so they reach the worker in order.
  const each = (engine: CommandEngine, at: PageAddress, method: "removeAnnotation" | "restoreAnnotation") =>
    Promise.all(ids.map((id) => engine(method, { ...at, id })));
  return pageEditCommand(content, pageId, label, {
    apply: (engine, at) => each(engine, at, "removeAnnotation"),
    undo: (engine, at) => each(engine, at, "restoreAnnotation"),
  });
}
