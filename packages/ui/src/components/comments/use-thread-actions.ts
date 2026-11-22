import {
  deleteAnnotations,
  deleteReply,
  isEditable,
  replyTo,
  setComment,
  type Annotation,
  type CommentReply,
} from "@pdf-editor/core";
import { useEditorServices } from "../../editor/hooks";
import { useAnnotationUi } from "../../state/annotation-store";
import { useProfile } from "../../state/profile-store";

/** What can be done to one annotation's comment thread. */
export interface ThreadActions {
  /** False for annotations from other apps: their own comment is shown, not changed. */
  readonly canComment: boolean;
  /**
   * Writes or changes the annotation's own comment, signed with the user's name.
   * @param text The comment.
   */
  comment(text: string): void;
  /**
   * Adds a reply, signed with the user's name.
   * @param text The reply.
   */
  reply(text: string): void;
  /**
   * Deletes a reply.
   * @param reply The reply.
   */
  remove(reply: CommentReply): void;
  /** Deletes the mark itself, with its whole thread (undo brings both back). */
  deleteMark(): void;
}

/**
 * Undoable actions on an annotation's comment thread.
 * @param pageId The page the annotation is on.
 * @param annotation The annotation.
 * @returns The actions.
 */
export function useThreadActions(pageId: string, annotation: Annotation): ThreadActions {
  const { session } = useEditorServices();
  // Read when sending, not when rendering: a first comment is sent right after the name is saved.
  const author = () => useProfile.getState().name;
  const now = () => new Date().toISOString();
  return {
    canComment: isEditable(annotation) && annotation.kind !== "textBox",
    comment: (text) => {
      if (!isEditable(annotation)) return;
      session.dispatch((content) =>
        setComment(content, pageId, annotation, { text, author: author(), modified: now() }),
      );
    },
    reply: (text) => {
      const reply = { id: crypto.randomUUID(), text, author: author(), modified: now() };
      session.dispatch((content) => replyTo(content, pageId, annotation.id, reply));
    },
    remove: (reply) => session.dispatch((content) => deleteReply(content, pageId, reply)),
    deleteMark: () => {
      useAnnotationUi.getState().select(null);
      session.dispatch((content) => deleteAnnotations(content, pageId, [annotation]));
    },
  };
}
