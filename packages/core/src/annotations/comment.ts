/**
 * Comments on annotations, Acrobat style. A markup's own comment is stored on it (/Contents, with
 * the author in /T and the time in /M); each reply is a hidden note linked to it with /IRT.
 */

/** What someone wrote, who, and when. */
export interface CommentNote {
  readonly text: string;
  readonly author: string;
  /** ISO 8601, or `null` when the file does not say. */
  readonly modified: string | null;
}

/** A reply in a comment thread. */
export interface CommentReply extends CommentNote {
  /** Stable id, stored in the PDF as the reply's name (/NM). */
  readonly id: string;
}

/** D:YYYYMMDDHHmmSS followed by Z or an offset such as +07'00'; everything after the year may be left out. */
const PDF_DATE = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz+-])(?:(\d{2})'?(\d{2})?'?)?)?$/;

/**
 * A time as a PDF date string, in UTC.
 * @param iso An ISO 8601 time.
 * @returns For example "D:20261121090507Z".
 */
export function toPdfDate(iso: string): string {
  const digits = new Date(iso).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `D:${digits}Z`;
}

/**
 * Reads a PDF date string.
 * @param value A date as PDF files write it.
 * @returns The time in ISO 8601, or `null` if the value is not a PDF date.
 */
export function fromPdfDate(value: string): string | null {
  const match = PDF_DATE.exec(value.trim());
  if (!match) return null;
  const [
    ,
    year,
    month = "01",
    day = "01",
    hour = "00",
    minute = "00",
    second = "00",
    sign,
    offsetHours = "00",
    offsetMinutes = "00",
  ] = match;
  const local = Date.UTC(+year!, +month - 1, +day, +hour, +minute, +second);
  const offset = (+offsetHours * 60 + +offsetMinutes) * 60_000;
  const utc = sign === "+" ? local - offset : sign === "-" ? local + offset : local;
  return Number.isNaN(utc) ? null : new Date(utc).toISOString();
}
