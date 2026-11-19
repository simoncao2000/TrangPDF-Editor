import { useId, useState } from "react";

interface RangeFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Shows the value next to the label, e.g. as "70%" or "2 pt". */
  format(value: number): string;
  /** Runs once the user lets go (pointer up, key up, or leaving the field), not on every step. */
  onCommit(value: number): void;
}

/**
 * A labelled slider. It moves freely while dragged and reports the value once, when released, so
 * an annotation edit becomes one undo step instead of dozens.
 * @param props Label, range, the value and its formatting, and the commit callback.
 * @returns The label, the value and the slider.
 */
export function RangeField({ label, value, min, max, step, format, onCommit }: RangeFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  // A new value from outside (another annotation selected, an undo) replaces the draft.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const fill = ((draft - min) / (max - min)) * 100;

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="flex justify-between gap-2 text-xs font-semibold text-muted">
        {label}
        <output htmlFor={id} className="text-ink tabular-nums">
          {format(draft)}
        </output>
      </label>
      <input
        id={id}
        type="range"
        className="range-field"
        style={{ ["--fill" as string]: `${fill}%` }}
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}
