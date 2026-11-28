import type { OpenErrorKind } from "@pdf-editor/shared";
import { OPEN_ERROR_MESSAGES } from "../../messages/open-errors";
import { useFileOpener } from "../../editor/use-file-opener";
import { Button } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";
import { TriangleAlert } from "lucide-react";

interface OpenErrorDialogProps {
  readonly kind: Exclude<OpenErrorKind, "password-required" | "wrong-password">;
  readonly fileName: string | null;
  /** Clears the error and returns to the start screen. */
  readonly onClose: () => void;
}

/**
 * Explains why a file could not be opened and offers the next step.
 * @param props Error kind, file name and close handler.
 * @returns The dialog.
 */
export function OpenErrorDialog({ kind, fileName, onClose }: OpenErrorDialogProps) {
  const { openFromPicker } = useFileOpener();
  const message = OPEN_ERROR_MESSAGES[kind];

  return (
    <Dialog
      title={message.title}
      description={
        fileName ? (
          <>
            <strong className="text-ink">{fileName}</strong>: {message.body}
          </>
        ) : (
          message.body
        )
      }
      icon={TriangleAlert}
      tone="danger"
      onDismiss={onClose}
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              void openFromPicker();
            }}
          >
            Choose another file
          </Button>
        </>
      }
    />
  );
}
