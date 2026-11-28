import { useState, type FormEvent } from "react";

interface NamePromptProps {
  /** The name to start from. */
  readonly initial: string;
  /** "Save and comment" before a first comment, "Save" when changing it. */
  readonly submitLabel: string;
  /**
   * Called with the new name.
   * @param name The name, trimmed and not empty.
   */
  onSave(name: string): void;
}

/**
 * Asks for the name comments are signed with. Shown once, before the first comment, and from
 * "Change" in the Comments panel.
 * @param props The starting name, the button label and the save callback.
 * @returns The form.
 */
export function NamePrompt({ initial, submitLabel, onSave }: NamePromptProps) {
  const [name, setName] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) onSave(name.trim());
  };
  return (
    <form className="grid gap-2" onSubmit={submit}>
      <p className="text-sm font-semibold">What name should your comments show?</p>
      <p className="text-xs text-muted">Saved on this device. You can change it in the Comments panel.</p>
      <input
        // Asked right when someone tries to comment: typing should start at once.
        autoFocus
        aria-label="Your name"
        placeholder="Your name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-8.5 rounded-sm border border-line bg-surface px-2.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!name.trim()}
          className="h-7.5 rounded-sm bg-action px-3 text-sm text-on-action transition-transform duration-(--duration-press) active:scale-[0.97] disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
