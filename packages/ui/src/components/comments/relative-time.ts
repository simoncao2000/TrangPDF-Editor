/** When a comment was written, as people say it: "just now", "5 min ago", "2 days ago", then the date. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * How long ago a time was.
 * @param iso An ISO 8601 time, or `null` when unknown.
 * @param now The current time in milliseconds (for tests).
 * @returns The phrase, or "" for no time.
 */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  const age = now - then;
  if (age < MINUTE) return "just now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  if (age < WEEK) {
    const days = Math.floor(age / DAY);
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  return DATE.format(then);
}
