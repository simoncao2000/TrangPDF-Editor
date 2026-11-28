import { useState, type KeyboardEvent } from "react";
import type { FormTypographyProps } from "./FormLayer";
import { FORM_CONTROL_CLASSES } from "./form-control-classes";
import { useFormTextStyle } from "./use-form-text-style";

/**
 * Edits a widget's text locally until the user commits it.
 * @param props The current widget and its commit handler.
 * @returns A single-line or multiline text control.
 */
export function FormText({ widget, commit, zoom }: FormTypographyProps) {
  const [draft, setDraft] = useState<string>();
  const value = draft ?? widget.value;
  const { ref, typography } = useFormTextStyle(widget, zoom, value);

  /** @param event The key pressed while editing the field. */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(undefined);
    }
    if (event.key === "Enter" && (!widget.multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit(value);
      setDraft(undefined);
    }
  };

  const Control = widget.multiline ? "textarea" : "input";
  return (
    <Control
      aria-label={widget.name}
      aria-required={widget.required}
      className={`${FORM_CONTROL_CLASSES} resize-none bg-transparent text-transparent caret-paper-focus hover:inset-ring-1 hover:inset-ring-paper-line focus:bg-paper-field focus:text-(--form-text-color)`}
      ref={ref}
      style={typography}
      readOnly={widget.readOnly}
      spellCheck={false}
      value={value}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        commit(value);
        setDraft(undefined);
      }}
    />
  );
}
