import type { CommentSegment } from "@pdf-editor/core";

import { COMMENT_INK_CLASS } from "./comment-draft";

/**
 * Displays comment segments from the worker as text and React elements.
 * @param props The comment body.
 * @returns A formatted paragraph.
 */
export function CommentBody({ body }: { readonly body: readonly CommentSegment[] }) {
  return (
    <p className="text-sm wrap-anywhere whitespace-pre-wrap text-ink">
      {body.map(({ text, ink, bold, italic, underline }, index) => {
        return (
          <span
            key={index}
            className={[COMMENT_INK_CLASS[ink], bold && "font-bold", italic && "italic", underline && "underline"]
              .filter(Boolean)
              .join(" ")}
          >
            {text}
          </span>
        );
      })}
    </p>
  );
}
