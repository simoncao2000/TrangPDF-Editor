import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  COMMENT_INKS,
  isRichCommentTooLarge,
  plainComment,
  type CommentInk,
  type CommentSegment,
} from "@pdf-editor/core";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  DROP_COMMAND,
  FORMAT_TEXT_COMMAND,
  getStyleObjectFromCSS,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  type RangeSelection,
} from "lexical";
import { SendHorizontal } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useProfile } from "../../state/profile-store";
import { $patchStyleText } from "../text-format/text-runs";
import { TEXT_STYLE_TOGGLES } from "../text-format/use-text-style";
import {
  $commentNodes,
  $readCommentDraft,
  COMMENT_INK_CLASS,
  commentInkColor,
  commentInkOf,
  pastedComment,
} from "./comment-draft";
import { NamePrompt } from "./NamePrompt";

interface CommentComposerProps {
  readonly placeholder: string;
  readonly initial?: readonly CommentSegment[];
  readonly autoFocus?: boolean;
  /**
   * Sends the current draft when the writer has a name.
   * @param body The trimmed comment segments.
   * @returns Nothing.
   */
  onSubmit(body: readonly CommentSegment[]): void;
}

/**
 * A comment-specific Lexical editor with the limited formatting toolbar.
 * @param props The starting body, focus, placeholder and submit handler.
 * @returns The comment form or the name prompt.
 */
export function CommentComposer({ placeholder, initial, autoFocus, onSubmit }: CommentComposerProps) {
  const name = useProfile((state) => state.name);
  const setName = useProfile((state) => state.setName);
  const [pending, setPending] = useState<readonly CommentSegment[]>();

  if (pending) {
    return (
      <NamePrompt
        initial=""
        submitLabel="Save and comment"
        onSave={(saved) => {
          setName(saved);
          setPending(undefined);
          onSubmit(pending);
        }}
      />
    );
  }

  return (
    <LexicalComposer
      initialConfig={{
        namespace: "Comment",
        /** @param error The Lexical failure. @returns Never, as the error propagates. */
        onError: (error) => {
          throw error;
        },
        theme: { text: { bold: "font-bold", italic: "italic", underline: "underline" } },
        /** @returns Nothing. */
        editorState: () => {
          $getRoot().append($createParagraphNode().append(...$commentNodes(initial ?? [])));
        },
      }}
    >
      {autoFocus && <AutoFocusPlugin />}
      <CommentDraft
        placeholder={placeholder}
        hasText={!!initial?.some(({ text }) => text.trim())}
        onSubmit={name ? onSubmit : setPending}
      />
    </LexicalComposer>
  );
}

interface DraftProps {
  readonly placeholder: string;
  readonly hasText: boolean;
  /** @param body The current comment. @returns Nothing. */
  onSubmit(body: readonly CommentSegment[]): void;
}

const FORMAT_BUTTON =
  "grid size-7 place-items-center rounded-xs text-sm text-muted hover:bg-hover hover:text-ink " +
  "aria-pressed:bg-pressed aria-pressed:text-ink active:scale-95 pointer-coarse:size-10";

/**
 * Handles comment draft input and formatting.
 * @param props The placeholder, initial send state and submit callback.
 * @returns An editor with focus-only formatting controls.
 */
function CommentDraft({ placeholder, hasText, onSubmit }: DraftProps) {
  const [editor] = useLexicalComposerContext();
  const [focused, setFocused] = useState(false);
  const [pickingInk, setPickingInk] = useState(false);
  const [canSend, setCanSend] = useState(hasText);
  const [tooLarge, setTooLarge] = useState(false);
  const errorId = useId();
  const [format, setFormat] = useState({ bold: false, italic: false, underline: false, ink: "black" as CommentInk });
  const lastSelection = useRef<RangeSelection | null>(null);
  const inkButton = useRef<HTMLButtonElement>(null);

  const validate = useCallback(
    /**
     * Validates the draft before clearing it or prompting for the author's name.
     * @param body The draft segments.
     * @returns Whether the draft can be sent.
     */
    (body: readonly CommentSegment[]) => {
      const exceedsLimit = isRichCommentTooLarge(body);
      setTooLarge(exceedsLimit);
      return body.length > 0 && !exceedsLimit;
    },
    [],
  );

  useEffect(() => {
    /** @returns Whether the Enter command was handled. */
    const submitDraft = () => {
      if (editor.isComposing()) return false;
      const body = $readCommentDraft();
      if (validate(body)) {
        $getRoot().clear().append($createParagraphNode()).selectEnd();
        onSubmit(body);
      }
      return true;
    };
    const unregister = [
      editor.registerUpdateListener(({ editorState }) =>
        editorState.read(() => {
          setCanSend(!!$getRoot().getTextContent().trim());
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          lastSelection.current = selection.clone();
          setFormat({
            bold: selection.hasFormat("bold"),
            italic: selection.hasFormat("italic"),
            underline: selection.hasFormat("underline"),
            ink: commentInkOf(getStyleObjectFromCSS(selection.style).color) ?? "black",
          });
        }),
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event?.isComposing || editor.isComposing()) return false;
          event?.preventDefault();
          if (event?.shiftKey) return editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
          return submitDraft();
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(INSERT_PARAGRAPH_COMMAND, submitDraft, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        (style) => !TEXT_STYLE_TOGGLES.some(([allowed]) => allowed === style),
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          event.preventDefault();
          const clipboard =
            "clipboardData" in event ? event.clipboardData : "dataTransfer" in event ? event.dataTransfer : null;
          const selection = $getSelection();
          if (!clipboard || !$isRangeSelection(selection)) return true;
          const html = clipboard.getData("text/html");
          const plain = clipboard.getData("text/plain");
          const segments = html ? pastedComment(html) : [];
          selection.insertNodes($commentNodes(segments.length ? segments : plainComment(plain)));
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    ];
    return () => unregister.forEach((remove) => remove());
  }, [editor, onSubmit, validate]);

  useEffect(() => {
    if (!tooLarge) return;
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size || dirtyLeaves.size) {
        setTooLarge(editorState.read(() => isRichCommentTooLarge($readCommentDraft())));
      }
    });
  }, [editor, tooLarge]);

  /**
   * Sends from the form's submit button.
   * @param event The form event.
   * @returns Nothing.
   */
  function send(event: FormEvent) {
    event.preventDefault();
    const body = editor.getEditorState().read($readCommentDraft);
    if (!validate(body)) return;
    editor.update(() => $getRoot().clear().append($createParagraphNode()));
    onSubmit(body);
  }

  /**
   * Applies an edit even if a keyboard user moved focus into the toolbar.
   * @param edit A change to make with the current draft selection.
   * @returns Nothing.
   */
  function apply(edit: (selection: RangeSelection) => void) {
    editor.update(() => {
      if (!$isRangeSelection($getSelection()) && lastSelection.current) $setSelection(lastSelection.current.clone());
      const selection = $getSelection();
      if ($isRangeSelection(selection)) edit(selection);
    });
  }

  return (
    <form
      onSubmit={send}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !pickingInk) return;
        event.stopPropagation();
        if (event.target !== editor.getRootElement()) inkButton.current?.focus();
        setPickingInk(false);
      }}
      data-focused={focused || undefined}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocused(false);
        setPickingInk(false);
      }}
      className={
        "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-sm bg-hover py-1 pr-1 pl-2.5 " +
        "data-focused:gap-1.5 data-focused:pt-2 data-focused:pr-2 data-focused:pb-1.5 " +
        "data-focused:inset-ring-2 data-focused:inset-ring-focus"
      }
    >
      <div className="relative min-w-0 data-focused:col-span-2" data-focused={focused || undefined}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label={placeholder.replace("…", "")}
              aria-describedby={tooLarge ? errorId : undefined}
              aria-invalid={tooLarge}
              className={
                "max-h-32 min-h-6.5 overflow-y-auto py-1 text-sm wrap-anywhere whitespace-pre-wrap " +
                "text-ink caret-focus outline-none"
              }
            />
          }
          placeholder={
            <div className="pointer-events-none absolute inset-x-0 top-1 text-sm text-muted">{placeholder}</div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      {focused && (
        <div role="group" aria-label="Comment format" className="relative flex items-center gap-0.5">
          {TEXT_STYLE_TOGGLES.map(([style, label, className]) => (
            <button
              key={style}
              type="button"
              aria-label={style[0]!.toUpperCase() + style.slice(1)}
              aria-pressed={format[style]}
              className={`${FORMAT_BUTTON} ${className}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => apply(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, style))}
            >
              {label}
            </button>
          ))}
          <button
            ref={inkButton}
            type="button"
            aria-label="Text colour"
            aria-expanded={pickingInk}
            className={FORMAT_BUTTON}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setPickingInk(!pickingInk)}
          >
            <span className={`grid place-items-center gap-px font-bold ${COMMENT_INK_CLASS[format.ink]}`}>
              A<span className="h-0.5 w-3 rounded-full bg-current" />
            </span>
          </button>
          {pickingInk && (
            <div
              role="group"
              aria-label="Comment inks"
              className={
                "absolute bottom-full left-0 z-10 mb-1 grid grid-cols-2 gap-0.5 rounded-sm " +
                "bg-raised p-1 shadow-1 ring-1 ring-line"
              }
            >
              {COMMENT_INKS.map((ink) => (
                <button
                  key={ink}
                  type="button"
                  aria-pressed={format.ink === ink}
                  className={
                    `rounded-xs px-2 py-1 text-left text-sm capitalize hover:bg-hover aria-pressed:bg-pressed ` +
                    COMMENT_INK_CLASS[ink]
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    apply((selection) => $patchStyleText(selection, "color", commentInkColor(ink)));
                    setPickingInk(false);
                  }}
                >
                  {ink}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        type="submit"
        aria-label="Send"
        title="Send (Enter)"
        disabled={!canSend}
        className={
          "col-start-2 grid size-7 shrink-0 place-items-center rounded-xs bg-action text-on-action " +
          "transition-transform duration-(--duration-press) active:scale-[0.94] disabled:opacity-40"
        }
      >
        <SendHorizontal className="size-3.5" aria-hidden="true" />
      </button>
      {tooLarge && (
        <p id={errorId} role="alert" className="col-span-2 pb-1 text-xs text-danger">
          This comment exceeds the PDF limit for formatted text. Shorten it or remove formatting to send.
        </p>
      )}
    </form>
  );
}
