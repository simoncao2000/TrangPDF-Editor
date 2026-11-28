import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { pagesLabel } from "@pdf-editor/core";
import { Button } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";

export interface InsertPosition {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly index: number;
}

interface InsertPagesDialogProps {
  readonly initialPosition?: InsertPosition["id"];
  readonly fileName: string;
  readonly pageCount: number;
  readonly positions: readonly InsertPosition[];
  readonly onInsert: (index: number) => void;
  readonly onCancel: () => void;
}

/**
 * Asks where the pages of a chosen file go.
 * @param props The file, the positions to offer, and the handlers.
 * @returns The dialog.
 */
export function InsertPagesDialog(props: InsertPagesDialogProps) {
  const { fileName, pageCount, positions, initialPosition, onInsert, onCancel } = props;
  const [chosen, setChosen] = useState(initialPosition ?? positions.at(1)?.id ?? positions[0]?.id);
  const index = positions.find((position) => position.id === chosen)?.index ?? 0;

  return (
    <Dialog
      title={`Insert ${fileName}`}
      description={`${pagesLabel(pageCount)} will be added where you choose.`}
      icon={FilePlus2}
      onDismiss={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onInsert(index)}>
            Insert {pagesLabel(pageCount)}
          </Button>
        </>
      }
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-semibold text-muted">Position</legend>
        {positions.map((position) => (
          <label
            key={position.id}
            className="flex min-h-(--control-target) cursor-pointer items-center gap-3 rounded-xs border border-divider px-3 py-2 text-sm transition-colors has-checked:border-signal has-checked:bg-signal-soft"
          >
            <input
              type="radio"
              name="insert-position"
              checked={chosen === position.id}
              onChange={() => setChosen(position.id)}
              className="size-4 accent-signal"
            />
            <span className="grid">
              <span className="font-semibold">{position.label}</span>
              <span className="text-xs text-muted">{position.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
