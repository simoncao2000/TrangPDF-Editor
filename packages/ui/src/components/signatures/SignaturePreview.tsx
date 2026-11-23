import type { SavedSignature } from "../../state/signature-store";
import { SIGNATURE_INKS, SIGNATURE_STYLES } from "./typed-signature";

/**
 * A saved signature shown small, for choosing it.
 * @param props The signature.
 * @param props.signature The signature.
 * @returns A styled name or an SVG of the drawn strokes.
 */
export function SignaturePreview({ signature }: { readonly signature: SavedSignature }) {
  if (signature.kind === "typed") {
    return (
      <span
        className="block truncate rounded-sm bg-paper-field px-2 py-1 text-center text-xl"
        style={{ fontFamily: SIGNATURE_STYLES[signature.style].family, color: SIGNATURE_INKS[signature.ink] }}
      >
        {signature.text}
      </span>
    );
  }
  const pad = 0.04;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${1 + 2 * pad} ${signature.aspect + 2 * pad}`}
      className="h-10 w-full text-ink"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {signature.strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.012}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
