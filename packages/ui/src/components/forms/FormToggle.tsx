import { Check } from "lucide-react";
import type { FormControlProps } from "./FormLayer";

interface FormToggleProps extends FormControlProps {
  readonly pageId: string;
}

/**
 * Shows a checkbox or radio widget with native keyboard interaction.
 * @param props The widget, its page and commit handler.
 * @returns A native input and its styled check or radio mark.
 */
export function FormToggle({ widget, pageId, commit }: FormToggleProps) {
  const radio = widget.kind === "radio";
  return (
    <label className="grid size-full place-items-center">
      <input
        aria-label={widget.name}
        aria-required={widget.required}
        aria-disabled={widget.readOnly}
        checked={widget.checked}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        disabled={widget.readOnly}
        name={radio ? `${pageId}:${widget.name}` : undefined}
        type={radio ? "radio" : "checkbox"}
        onChange={(event) => commit(event.currentTarget.checked ? widget.exportValue : "Off")}
      />
      <span
        className="grid size-full place-items-center rounded-[calc(0.7*var(--form-unit))] border-(length:--form-border) border-paper-line bg-paper-field text-paper-focus peer-focus-visible:border-paper-focus peer-focus-visible:ring-(length:--form-ring-size) peer-focus-visible:ring-paper-focus/18 data-radio:rounded-full"
        data-radio={radio || undefined}
        aria-hidden="true"
      >
        {widget.checked &&
          (radio ? (
            <span className="size-[min(44%,calc(1.7*var(--form-unit)))] rounded-full bg-current" />
          ) : (
            <Check className="size-[min(74%,calc(2.8*var(--form-unit)))]" strokeWidth={3} />
          ))}
      </span>
    </label>
  );
}
