import type { FormFieldKind } from "@pdf-editor/core";
import {
  Check,
  CircleDot,
  Signature,
  SquareCheck,
  SquareChevronDown,
  TextCursorInput,
  TriangleAlert,
} from "lucide-react";
import { useDocument } from "../../editor/hooks";
import { Button } from "../primitives/Button";
import { fieldProgress, nextRequiredField } from "./field-progress";
import type { DocumentField } from "./use-document-fields";
import { useFieldNavigation } from "./use-field-navigation";

interface FieldsPanelProps {
  readonly fields: readonly DocumentField[];
  readonly validate: boolean;
  readonly headingHidden?: boolean;
  /**
   * Visits a field from the enclosing layout.
   * @param field The field to visit.
   * @returns Nothing.
   */
  onOpenField?(field: DocumentField): void;
}

const FIELD_ICONS = {
  text: TextCursorInput,
  checkbox: SquareCheck,
  radio: CircleDot,
  choice: SquareChevronDown,
  signature: Signature,
  button: SquareCheck,
} satisfies Record<FormFieldKind, typeof Check>;

const STATUS = {
  Filled: { color: "text-success", icon: Check },
  Required: { color: "text-warning", icon: TriangleAlert },
  Optional: { color: "", icon: null },
  Fix: { color: "text-danger", icon: TriangleAlert },
};

/**
 * Shows document-wide form progress and lets the user jump to a field.
 * @param props Fields, validation and optional layout overrides.
 * @returns The form review and navigation controls.
 */
export function FieldsPanel({ fields, validate, headingHidden, onOpenField }: FieldsPanelProps) {
  const fileName = useDocument((state) => state.fileName);
  const navigation = useFieldNavigation();
  const { current } = navigation;
  const open = onOpenField ?? navigation.open;
  const { done, total, remaining } = fieldProgress(fields);
  const next = nextRequiredField(fields, current);
  const invalid = validate && remaining > 0;
  const currentNeedsAnswer = fields.some((field) => field.name === current && field.required && !field.filled);
  const marked = invalid && !currentNeedsAnswer ? next?.name : current;
  const progress = `${done} of ${total} done`;
  const hasSignature = fields.some((field) => field.kind === "signature" && field.filled);

  return (
    <section className="grid gap-(--space-3)" aria-labelledby="form-fields-title">
      <div className={headingHidden ? "sr-only" : "flex items-baseline justify-between gap-(--space-2)"}>
        <h3 id="form-fields-title" className="text-sm font-semibold text-ink">
          Form fields
        </h3>
        <span role="status" className="shrink-0 text-xs text-muted tabular-nums">
          {invalid && <span>{remaining} to fix</span>}
          <span className={invalid ? "sr-only" : undefined}>{progress}</span>
        </span>
      </div>
      {remaining === 0 && (
        <p className="text-sm leading-[1.45] wrap-anywhere text-muted">
          Saving writes your answers{hasSignature ? " and signature" : ""} into {fileName ?? "the PDF"}.
        </p>
      )}
      <ul className="grid gap-0.5">
        {fields.map((field) => (
          <FieldRow key={field.name} field={field} current={field.name === marked} validate={invalid} open={open} />
        ))}
      </ul>
      {next && (
        <div>
          <Button variant="primary" onClick={() => open(next)}>
            Next field
          </Button>
        </div>
      )}
    </section>
  );
}

interface FieldRowProps {
  readonly field: DocumentField;
  readonly current: boolean;
  readonly validate: boolean;
  readonly open: (field: DocumentField) => void;
}

/**
 * @param props A field's summary, current state and navigation handler.
 * @returns An accessible row with its field kind and status.
 */
function FieldRow({ field, current, validate, open }: FieldRowProps) {
  const KindIcon = FIELD_ICONS[field.kind];
  const status = field.filled ? "Filled" : field.required ? (validate ? "Fix" : "Required") : "Optional";
  const { color, icon: StatusIcon } = STATUS[status];

  return (
    <li>
      <button
        type="button"
        aria-current={current || undefined}
        onClick={() => open(field)}
        className="grid min-h-(--control-target) w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-(--space-3) rounded-md px-(--space-3) py-(--space-2) text-left text-sm leading-[1.4] text-ink transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none aria-current:bg-selection aria-current:text-on-selection"
      >
        <KindIcon className="size-4 text-muted" aria-hidden="true" />
        <span className="wrap-anywhere">{field.name.trim() ? field.name : "Unnamed field"}</span>
        <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${color}`}>
          {StatusIcon && <StatusIcon className="size-3.25" aria-hidden="true" />}
          {status}
        </span>
      </button>
    </li>
  );
}
