interface PaperBoatProps {
  readonly className?: string;
}

/**
 * The sketchbook's paper-boat doodle for empty states. Decorative.
 * @param props Size and position classes.
 * @returns An inline SVG hidden from assistive technology.
 */
export function PaperBoat({ className = "" }: PaperBoatProps) {
  return (
    <svg className={`h-auto text-ink ${className}`} viewBox="0 0 134 78" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 44l30 3 28-32 7 28 42-11-24 29-63 2zM12 44l41 11 66-23M42 47l11 8 17-40M77 43L53 55M32 63l23-6 40 4" />
      <path
        strokeWidth={0.95}
        d="M37 58l6 1m-2-5l9 2m8-7l10-24m-4 23l5-13m12 15l22-9m-17 11l11-5M8 67q23 6 45 1m13 3q18-4 38-3m9-5l9-1M20 24l3-6 2 6 5 2-5 1-2 5-1-5-4-1zm77-12 2-4 1 4 4 1-4 1-1 4-1-4-3-1z"
      />
    </svg>
  );
}
