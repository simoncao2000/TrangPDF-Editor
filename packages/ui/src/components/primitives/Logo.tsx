const MARK =
  "M6 31C10 17 20 10 32 14L38 16C42 9 48 6 54 7C62 8 61 18 54 24C49 28 43 28 38 26L32 41C29 49 23 54 13 58C18 51 19 47 21 40L28 23C20 20 13 24 6 31ZM42 18C46 20 50 19 53 16C56 13 55 11.5 53 11.5C49 11.5 45 14 42 18Z";

interface LogoProps {
  /** Show "TrangPDF" next to the mark. */
  readonly withWord?: boolean;
}

/**
 * The Ink turn mark, drawn in `currentColor` so it follows the theme.
 * @param props Whether to show the word mark.
 * @returns The logo, labelled "TrangPDF" for assistive technology.
 */
export function Logo({ withWord = false }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2 text-ink" role="img" aria-label="TrangPDF">
      <svg className="size-7" viewBox="0 0 64 64" aria-hidden="true">
        <path fill="currentColor" fillRule="evenodd" d={MARK} />
      </svg>
      {withWord && (
        <span className="font-hand text-[1.45rem] leading-none" aria-hidden="true">
          Trang<span className="text-signal">PDF</span>
        </span>
      )}
    </span>
  );
}
