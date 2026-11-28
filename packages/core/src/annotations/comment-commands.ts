/**
 * Commands for comment threads. A markup's own comment is part of the annotation, so it is written
 * with `putAnnotation`; replies are their own (hidden) annotations, removed and restored like any
 * other. Each command gives the page a new revision, so the page's threads are read again.
 */
import type { Command } from "../document/commands";
import type { DocumentContent } from "../document/document-state";
import { pageEditCommand } from "../document/page-edit-command";
import type { EditableAnnotation } from "./annotation";
import { commentText, plainComment, type CommentNote, type CommentReply } from "./comment";

/** Written on undo of a markup's first comment: no text and no author reads back as no comment. */
const NO_COMMENT: CommentNote = { body: plainComment(""), author: "", modified: null };

/** A reply before and after an edit. */
export interface ReplyChange {
  readonly before: CommentReply;
  readonly after: CommentReply;
}

/**
 * Writes or changes the comment on a markup.
 * @param content The current content.
 * @param pageId The page.
 * @param annotation The markup as it is now.
 * @param comment The new comment.
 * @returns The command.
 */
export function setComment(
  content: DocumentContent,
  pageId: string,
  annotation: EditableAnnotation,
  comment: CommentNote,
): Command {
  const before = annotation.comment;
  return pageEditCommand(content, pageId, before && commentText(before.body) ? "Edit comment" : "Comment", {
    apply: (engine, at) =>
      engine("putAnnotation", { ...at, editComment: true, annotation: { ...annotation, comment } }),
    undo: (engine, at) =>
      engine("putAnnotation", {
        ...at,
        editComment: true,
        annotation: { ...annotation, comment: before ?? NO_COMMENT },
      }),
  });
}

/**
 * Adds a reply to an annotation's thread. Undo removes it; redo writes it again.
 * @param content The current content.
 * @param pageId The page.
 * @param parentId The annotation it answers.
 * @param reply The reply, with a fresh id.
 * @returns The command.
 */
export function replyTo(content: DocumentContent, pageId: string, parentId: string, reply: CommentReply): Command {
  return pageEditCommand(content, pageId, "Reply", {
    apply: (engine, at) => engine("putReply", { ...at, parentId, reply }),
    undo: (engine, at) => engine("removeAnnotation", { ...at, id: reply.id }),
  });
}

/**
 * Changes a reply's text.
 * @param content The current content.
 * @param pageId The page.
 * @param parentId The annotation it answers.
 * @param change The reply before and after.
 * @returns The command.
 */
export function editReply(content: DocumentContent, pageId: string, parentId: string, change: ReplyChange): Command {
  return pageEditCommand(content, pageId, "Edit reply", {
    apply: (engine, at) => engine("putReply", { ...at, parentId, reply: change.after }),
    undo: (engine, at) => engine("putReply", { ...at, parentId, reply: change.before }),
  });
}

/**
 * Deletes a reply. Undo brings back the very same reply.
 * @param content The current content.
 * @param pageId The page.
 * @param reply The reply.
 * @returns The command.
 */
export function deleteReply(content: DocumentContent, pageId: string, reply: CommentReply): Command {
  return pageEditCommand(content, pageId, "Delete reply", {
    apply: (engine, at) => engine("removeAnnotation", { ...at, id: reply.id }),
    undo: (engine, at) => engine("restoreAnnotation", { ...at, id: reply.id }),
  });
}
