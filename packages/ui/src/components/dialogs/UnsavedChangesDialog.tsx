import { Save } from "lucide-react";
import { useState } from "react";
import { useDocument } from "../../editor/hooks";
import { useLeaveGuard } from "../../editor/leave-guard";
import { useDocumentActions } from "../../editor/use-document-actions";
import { Button } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";

/**
 * Asks what to do with unsaved changes before closing or opening another file.
 * Save and close is the main action; Don't save discards the changes.
 * @returns The dialog while an action is waiting, otherwise nothing.
 */
export function UnsavedChangesDialog() {
  const { pending, clear } = useLeaveGuard();
  const actions = useDocumentActions();
  const fileName = useDocument((state) => state.fileName);
  const [saving, setSaving] = useState(false);
  if (!pending) return null;

  const proceed = () => {
    clear();
    pending();
  };

  return (
    <Dialog
      title={`Save changes to ${fileName ?? "this file"}?`}
      description="If you don’t save, your changes are lost."
      icon={Save}
      onDismiss={clear}
      actions={
        <>
          <Button variant="ghost" className="mr-auto text-danger" onClick={proceed}>
            Don’t save
          </Button>
          <Button onClick={clear}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const saved = await actions.save();
              setSaving(false);
              if (saved) proceed();
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    />
  );
}
