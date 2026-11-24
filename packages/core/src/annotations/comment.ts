/**
 * Comments on annotations, Acrobat style. A markup's own comment is stored on it (/Contents, with
 * the author in /T and the time in /M); each reply is a hidden note linked to it with /IRT.
 */

/** Named inks available in comments. */
export const COMMENT_INKS = ["black", "navy", "blue", "teal", "moss", "brown", "plum", "amber"] as const;
export type CommentInk = (typeof COMMENT_INKS)[number];

export interface CommentSegment {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly ink: CommentInk;
}

/** The style used by plain comments. */
export const PLAIN_COMMENT_STYLE = { bold: false, italic: false, underline: false, ink: "black" } as const;

/**
 * Wraps text from a plain comment.
 * @param text The comment text.
 * @returns One segment containing the text.
 */
export function plainComment(text: string): readonly CommentSegment[] {
  return [{ text, ...PLAIN_COMMENT_STYLE }];
}

/**
 * Reads the text of a comment body.
 * @param body The comment segments.
 * @returns Text with line breaks preserved.
 */
export function commentText(body: readonly CommentSegment[]): string {
  return body.map(({ text }) => text).join("");
}

/**
 * Coalesces adjacent segments with identical formatting.
 * @param body The source segments.
 * @returns The normalized body.
 */
export function mergeCommentSegments(body: readonly CommentSegment[]): CommentSegment[] {
  const merged: CommentSegment[] = [];
  for (const segment of body) {
    if (!segment.text) continue;
    const last = merged.at(-1);
    if (
      last &&
      last.bold === segment.bold &&
      last.italic === segment.italic &&
      last.underline === segment.underline &&
      last.ink === segment.ink
    ) {
      merged[merged.length - 1] = { ...last, text: last.text + segment.text };
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

/** What someone wrote, who, and when. */
export interface CommentNote {
  readonly body: readonly CommentSegment[];
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
