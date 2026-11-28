import { commentText, type Annotation, type AnnotationKind, type CommentReply } from "@pdf-editor/core";
import {
  Circle,
  Highlighter,
  Image as ImageIcon,
  Minus,
  MoveUpRight,
  PenLine,
  Spline,
  Square,
  StickyNote,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useAnnotationUi } from "../../state/annotation-store";
import { ANNOTATION_NAMES, cssColor } from "../annotations/annotation-display";
import { CommentBody } from "./CommentBody";
import { CommentComposer } from "./CommentComposer";
import { relativeTime } from "./relative-time";
import { useThreadActions } from "./use-thread-actions";

const KIND_ICONS: Record<AnnotationKind, LucideIcon> = {
  highlight: Highlighter,
  underline: Underline,
  strikeout: Strikethrough,
  squiggly: Spline,
  ink: PenLine,
  square: Square,
  circle: Circle,
  line: Minus,
  arrow: MoveUpRight,
  note: StickyNote,
  image: ImageIcon,
  textBox: Type,
  other: StickyNote,
};

interface CommentThreadProps {
  readonly pageId: string;
  readonly annotation: Annotation;
  /** Open: replies shown, and the comment and replies can be written. */
  readonly open: boolean;
  /** Called when a closed thread is clicked. */
  onOpen?(): void;
}

/**
 * One annotation's comment thread: who wrote it and when, the text it marks, the comment, and its
 * replies. Closed, it is a summary you click to open; open, it can be written in.
 * @param props The page, the annotation, whether it is open, and the open callback.
 * @returns The thread.
 */
export function CommentThread({ pageId, annotation, open, onOpen }: CommentThreadProps) {
  const actions = useThreadActions(pageId, annotation);
  const writing = useAnnotationUi((state) => open && state.writing && state.selected?.id === annotation.id);
  const [editing, setEditing] = useState(false);
  const { comment, replies = [] } = annotation;
  const plain = comment ? commentText(comment.body) : "";
  const name = ANNOTATION_NAMES[annotation.kind];
  const quote = annotation.kind === "highlight" ? annotation.quote : undefined;

  const body = (
    <>
      <ThreadHead
        kind={annotation.kind}
        color={cssColor(annotation.color)}
        author={comment?.author || name}
        time={relativeTime(comment?.modified ?? null)}
        onDelete={open ? actions.deleteMark : undefined}
      />
      {quote && <p className="truncate font-doc text-sm text-muted italic">“{quote}”</p>}
      {open && actions.canComment && (editing || !plain) ? (
        <CommentComposer
          placeholder="Add a comment…"
          initial={comment?.body}
          autoFocus={editing || writing}
          onSubmit={(text) => {
            actions.comment(text);
            setEditing(false);
          }}
        />
      ) : plain ? (
        <CommentBody body={comment?.body ?? []} />
      ) : (
        <p className="text-sm text-muted">Add a comment…</p>
      )}
      {open && actions.canComment && plain && !editing && (
        <button
          type="button"
          className="justify-self-start text-xs text-muted underline"
          onClick={() => setEditing(true)}
        >
          Edit comment
        </button>
      )}
      {!open && replies.length > 0 && (
        <p className="text-xs text-muted">{replies.length === 1 ? "1 reply" : `${replies.length} replies`}</p>
      )}
      {open && replies.map((reply) => <Reply key={reply.id} reply={reply} onDelete={() => actions.remove(reply)} />)}
      {open && (plain || !actions.canComment) && (
        <div className="ml-7.5">
          <CommentComposer placeholder="Reply…" onSubmit={actions.reply} />
        </div>
      )}
    </>
  );

  const frame = "grid gap-2 rounded-xs p-3 text-left";
  if (open) {
    return (
      <article aria-label={`${name} comment`} className={`${frame} bg-raised shadow-1 ring-1 ring-line/60`}>
        {body}
      </article>
    );
  }
  return (
    // A div, not a <button>: a thread holds paragraphs, which a button may not contain.
    <div
      role="button"
      tabIndex={0}
      aria-label={`${name}: ${plain || "no comment yet"}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen?.();
      }}
      className={`${frame} cursor-pointer transition-colors duration-(--duration-press) hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none`}
    >
      {body}
    </div>
  );
}

interface ThreadHeadProps {
  readonly kind: AnnotationKind;
  /** The annotation's colour, which tints its icon. */
  readonly color: string;
  readonly author: string | undefined;
  readonly time: string;
  /** Shown as a Delete button when given (open threads). */
  onDelete?(): void;
}

/**
 * The first line of a thread: what kind of mark it is, who wrote the comment, and when.
 * @param props Kind, colour, author, time and the delete callback.
 * @returns The line.
 */
function ThreadHead({ kind, color, author, time, onDelete }: ThreadHeadProps) {
  const Icon = KIND_ICONS[kind];
  return (
    <div className="flex items-center gap-2">
      <span
        className="grid size-5.5 shrink-0 place-items-center rounded-xs text-ink"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
        title={ANNOTATION_NAMES[kind]}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="truncate text-xs font-semibold text-ink">{author}</span>
      <span className="ml-auto shrink-0 text-xs text-muted">{time}</span>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${ANNOTATION_NAMES[kind].toLowerCase()}`}
          title={`Delete ${ANNOTATION_NAMES[kind].toLowerCase()} (Delete)`}
          onClick={onDelete}
          className="grid size-6 shrink-0 place-items-center rounded-xs text-muted transition-colors duration-(--duration-press) hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * One reply in an open thread, with a way to delete it.
 * @param props The reply and the delete callback.
 * @param props.reply The reply.
 * @param props.onDelete Called when Delete is pressed.
 * @returns The reply.
 */
function Reply({ reply, onDelete }: { readonly reply: CommentReply; onDelete(): void }) {
  return (
    <div className="group ml-7.5 grid gap-1 border-t border-divider pt-2">
      <div className="flex items-center gap-2">
        <span className="truncate text-xs font-semibold text-ink">{reply.author || "Unknown"}</span>
        <span className="ml-auto shrink-0 text-xs text-muted">{relativeTime(reply.modified)}</span>
        <button
          type="button"
          aria-label={`Delete reply from ${reply.author || "unknown"}`}
          onClick={onDelete}
          className="grid size-6 place-items-center rounded-xs text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <CommentBody body={reply.body} />
    </div>
  );
}
