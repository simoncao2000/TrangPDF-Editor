import { Plus, Trash2 } from "lucide-react";
import { useSignatures } from "../../state/signature-store";
import { SignaturePreview } from "./SignaturePreview";

/**
 * The signatures saved on this device, for the Sign tool: pick the one to place, remove one, or
 * create a new one.
 * @returns The list.
 */
export function SignatureList() {
  const { signatures, currentId, temporary, choose, remove, setDrawing } = useSignatures();
  return (
    <div className="grid gap-2">
      {signatures.map((signature) => (
        <div
          key={signature.id}
          className={`group relative grid gap-1 rounded-sm p-2 ring-1 transition-colors duration-(--duration-press) ${
            !temporary && signature.id === currentId ? "bg-raised ring-action" : "ring-divider hover:bg-hover"
          }`}
        >
          <button
            type="button"
            aria-pressed={!temporary && signature.id === currentId}
            aria-label={signature.kind === "typed" ? `Use signature: ${signature.text}` : "Use this signature"}
            onClick={() => choose(signature.id)}
            className="grid min-w-0 gap-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <SignaturePreview signature={signature} />
            <span className="text-xs text-muted">
              {signature.kind === "typed" ? "Typed · saved on this device" : "Saved on this device"}
            </span>
          </button>
          <button
            type="button"
            aria-label="Remove this signature"
            title="Remove"
            onClick={() => remove(signature.id)}
            className="absolute top-1 right-1 grid size-6 place-items-center rounded-xs text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setDrawing(true)}
        className="flex h-9 items-center justify-center gap-1.5 rounded-sm border border-dashed border-line text-sm text-ink transition-colors duration-(--duration-press) hover:bg-hover"
      >
        <Plus className="size-4" aria-hidden="true" />
        New signature
      </button>
    </div>
  );
}
