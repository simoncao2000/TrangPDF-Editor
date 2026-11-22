import { SendHorizontal } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useProfile } from "../../state/profile-store";
import { NamePrompt } from "./NamePrompt";

interface CommentComposerProps {
  /** "Add a comment…" or "Reply…". */
  readonly placeholder: string;
  /** Text to start from (editing a comment). */
  readonly initial?: string;
  /** Focus the field when it appears. */
  readonly autoFocus?: boolean;
  /**
   * Called with what was written, once the writer has a name.
   * @param text The text, trimmed and not empty.
   */
  onSubmit(text: string): void;
}

/**
 * Where a comment or a reply is written: a field that grows with the text and a send button.
 * Enter sends, Shift+Enter starts a new line. The first time, it asks for the writer's name before
 * sending, and keeps what was written meanwhile.
 * @param props Placeholder, starting text, focus and the submit callback.
 * @returns The form, or the name prompt.
 */
export function CommentComposer({ placeholder, initial = "", autoFocus = false, onSubmit }: CommentComposerProps) {
  const name = useProfile((state) => state.name);
  const setName = useProfile((state) => state.setName);
  const [text, setText] = useState(initial);
  const [askingName, setAskingName] = useState(false);

  const send = () => {
    const written = text.trim();
    if (!written) return;
    if (!name) {
      setAskingName(true);
      return;
    }
    onSubmit(written);
    setText("");
  };

  if (askingName) {
    return (
      <NamePrompt
        initial=""
        submitLabel="Save and comment"
        onSave={(saved) => {
          setName(saved);
          setAskingName(false);
          onSubmit(text.trim());
          setText("");
        }}
      />
    );
  }

  const onSubmitForm = (event: FormEvent) => {
    event.preventDefault();
    send();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    send();
  };

  return (
    <form
      onSubmit={onSubmitForm}
      className="flex items-end gap-2 rounded-sm bg-hover py-1 pr-1 pl-2.5 focus-within:ring-2 focus-within:ring-focus"
    >
      <textarea
        aria-label={placeholder.replace("…", "")}
        placeholder={placeholder}
        value={text}
        rows={1}
        autoFocus={autoFocus}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="[field-sizing:content] max-h-32 min-h-6.5 flex-1 resize-none bg-transparent py-1 text-sm text-ink outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        aria-label="Send"
        title="Send (Enter)"
        disabled={!text.trim()}
        className="grid size-7 shrink-0 place-items-center rounded-xs bg-action text-on-action transition-transform duration-(--duration-press) active:scale-[0.94] disabled:opacity-40"
      >
        <SendHorizontal className="size-3.5" aria-hidden="true" />
      </button>
    </form>
  );
}
