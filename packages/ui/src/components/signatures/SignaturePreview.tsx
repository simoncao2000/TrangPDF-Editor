import type { SavedSignature } from "../../state/signature-store";

/**
 * A saved signature drawn small, for choosing it.
 * @param props The signature.
 * @param props.signature The signature.
 * @returns An SVG of its strokes.
 */
export function SignaturePreview({ signature }: { readonly signature: SavedSignature }) {
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
