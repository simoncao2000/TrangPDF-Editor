import { useState, type FormEvent } from "react";
import { useDocument, useEditorServices } from "../../editor/hooks";
import { Button } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";
import { Lock } from "lucide-react";

/**
 * Asks for the password of an encrypted file. The worker keeps the file's bytes, so retrying
 * does not read the file again. Nothing about the password is stored.
 * @returns The dialog.
 */
export function PasswordDialog() {
  const { session } = useEditorServices();
  const fileName = useDocument((state) => state.fileName);
  const wrong = useDocument((state) => state.error === "wrong-password");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    await session.submitPassword(password);
    setBusy(false);
    setPassword("");
  };

  return (
    <Dialog
      title={`${fileName ?? "This file"} is locked`}
      description="Enter its password to open it."
      icon={Lock}
      onDismiss={() => void session.close()}
      actions={
        <>
          <Button onClick={() => void session.close()}>Cancel</Button>
          <Button variant="primary" type="submit" form="password-form" disabled={!password || busy}>
            Unlock
          </Button>
        </>
      }
    >
      <form id="password-form" onSubmit={submit} className="grid gap-1.5">
        <label htmlFor="pdf-password" className="text-xs font-semibold text-muted">
          Password
        </label>
        <input
          id="pdf-password"
          type="password"
          autoFocus
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={wrong || undefined}
          aria-describedby="password-help"
          className="min-h-(--control-target) rounded-sm border border-line bg-raised px-3 text-sm text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus aria-invalid:border-danger"
        />
        <p id="password-help" className={`text-xs ${wrong ? "font-medium text-danger" : "text-muted"}`}>
          {wrong ? "That password didn’t work. Check caps lock and try again." : "Ask the person who sent the file."}
        </p>
      </form>
    </Dialog>
  );
}
