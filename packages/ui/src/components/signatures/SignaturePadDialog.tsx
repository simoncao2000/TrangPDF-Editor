import { PenLine, Signature, Type } from "lucide-react";
import { useId, useState } from "react";
import { useSignatures, type SavedSignature } from "../../state/signature-store";
import { Dialog } from "../primitives/Dialog";
import { DrawSignature } from "./DrawSignature";
import { TypeSignature } from "./TypeSignature";

const MODES = [
  { kind: "drawn", label: "Draw", icon: PenLine },
  { kind: "typed", label: "Type", icon: Type },
] as const;

/**
 * Opens the signature dialog on the last saved mode.
 * @returns The dialog while it is open, otherwise nothing.
 */
export function SignaturePadDialog() {
  const drawing = useSignatures((state) => state.drawing);
  return drawing ? <SignaturePad /> : null;
}

/**
 * Holds both editing modes and commits the accepted signature.
 * @returns The signature dialog.
 */
function SignaturePad() {
  const { lastMode, setDrawing, add, setTemporary, setLastMode } = useSignatures();
  const [mode, setMode] = useState(lastMode);
  const group = useId();

  /**
   * Dismisses the signature dialog.
   * @returns Nothing.
   */
  const close = () => setDrawing(false);

  /**
   * Makes the signature available to the Sign tool.
   * @param signature The signature to use.
   * @param save Whether to keep a typed signature on this device.
   * @returns Nothing.
   */
  const accept = (signature: SavedSignature, save = true) => {
    if (signature.kind === "typed" && !save) {
      setLastMode("typed");
      setTemporary(signature);
    } else add(signature);
    close();
  };

  return (
    <Dialog title="Add your signature" icon={Signature} onDismiss={close} actions={null}>
      <div className="grid gap-4 [&+div:empty]:hidden [dialog:has(&)]:w-[min(100%-2rem,35rem)]">
        <div
          role="radiogroup"
          aria-label="How to sign"
          className="inline-grid min-w-55 grid-cols-2 justify-self-start rounded-xs border border-line bg-surface p-0.5"
        >
          {MODES.map(({ kind, label, icon: Icon }) => (
            <label key={kind} className="relative cursor-pointer">
              <input
                type="radio"
                name={group}
                checked={mode === kind}
                onChange={() => setMode(kind)}
                className="peer sr-only"
              />
              <span className="peer-checked:shadow-sm flex h-8.5 items-center justify-center gap-1.5 rounded-xs px-4 text-sm text-muted peer-checked:bg-raised peer-checked:text-ink peer-focus-visible:ring-2 peer-focus-visible:ring-focus">
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </span>
            </label>
          ))}
        </div>
        <div hidden={mode !== "drawn"}>
          <DrawSignature onCancel={close} onUse={accept} />
        </div>
        <div hidden={mode !== "typed"}>
          <TypeSignature onCancel={close} onUse={accept} />
        </div>
      </div>
    </Dialog>
  );
}
