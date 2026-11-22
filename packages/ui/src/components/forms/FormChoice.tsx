import { ChevronDown } from "lucide-react";
import type { FormTypographyProps } from "./FormLayer";
import { FORM_CONTROL_CLASSES } from "./form-control-classes";
import { CHOICE_BUTTON_POINTS, scaleFormPoints } from "./form-text-layout";
import { useFormTextStyle } from "./use-form-text-style";

/**
 * Displays the widget's current choice and lets the browser present its options.
 * @param props The widget and its commit handler.
 * @returns A native select with the paper field styling.
 */
export function FormChoice({ widget, commit, zoom }: FormTypographyProps) {
  const { ref, typography } = useFormTextStyle(widget, zoom, widget.value);
  return (
    <>
      <select
        aria-label={widget.name}
        aria-required={widget.required}
        aria-disabled={widget.readOnly}
        className={`${FORM_CONTROL_CLASSES} appearance-none bg-(--form-tint) text-(--form-text-color) inset-ring-1 inset-ring-paper-line focus:bg-paper-field data-empty:text-paper-muted`}
        ref={ref}
        style={{ ...typography, paddingRight: scaleFormPoints(widget.textInset + CHOICE_BUTTON_POINTS, zoom) }}
        data-empty={widget.value === "" || undefined}
        disabled={widget.readOnly}
        value={widget.value}
        onChange={(event) => commit(event.currentTarget.value)}
      >
        {!widget.options.includes(widget.value) && (
          <option disabled value={widget.value}>
            {widget.value || "Choose an option"}
          </option>
        )}
        {widget.options.map((option, index) => (
          <option key={index} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 h-auto max-w-1/5 -translate-y-1/2 text-paper-muted"
        style={{ right: scaleFormPoints(widget.textInset + 2, zoom), width: scaleFormPoints(9, zoom) }}
        aria-hidden="true"
      />
    </>
  );
}
