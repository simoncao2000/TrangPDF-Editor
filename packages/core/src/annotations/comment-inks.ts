import type { CommentInk } from "./comment";

/** Light shades persisted in PDF rich comments. */
export const COMMENT_INK_HEX: Record<CommentInk, string> = {
  black: "#000000",
  navy: "#243d63",
  blue: "#305e86",
  teal: "#1f7a7a",
  moss: "#4f7a2a",
  brown: "#7a4b2a",
  plum: "#6a3d7a",
  amber: "#a25c15",
};

/**
 * Converts a supported hexadecimal colour to RGB channels.
 * @param value The hexadecimal colour.
 * @returns The channels.
 */
function channels(value: string): number[] {
  const digits = value.slice(1);
  return digits.length === 3
    ? [...digits].map((digit) => parseInt(digit + digit, 16))
    : [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16));
}

/**
 * Finds the closest palette ink within 90 RGB units.
 * @param value The comment's CSS colour.
 * @returns A named ink.
 */
export function nearestCommentInk(value: string): CommentInk {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return "black";
  const rgb = channels(value);
  let closest: CommentInk = "black";
  let distance = 90 ** 2;
  for (const [ink, hex] of Object.entries(COMMENT_INK_HEX)) {
    const delta = channels(hex).reduce((sum, channel, index) => sum + (channel - rgb[index]!) ** 2, 0);
    if (delta >= distance) continue;
    distance = delta;
    closest = ink as CommentInk;
  }
  return closest;
}
