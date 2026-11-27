import { PALETTE, type PaletteSlot } from "./tool-catalog";

/**
 * Returns the identity shared by a palette slot and its phone placement.
 * @param slot The palette slot.
 * @returns The tool or group identifier.
 */
export function phoneSlotId(slot: PaletteSlot) {
  return slot.kind === "tool" ? slot.tool : slot.name;
}

const FIXED_IDS = ["select", "Markup", "ink", "note"];
export const PHONE_FIXED = FIXED_IDS.flatMap((id) => PALETTE.filter((slot) => phoneSlotId(slot) === id));
export const PHONE_MORE = PALETTE.filter((slot) => !FIXED_IDS.includes(phoneSlotId(slot))).reverse();

/**
 * Updates the recent slot only for picks from the More column.
 * @param current The slot currently shown.
 * @param fromMore The slot picked from More, if any.
 * @returns The slot to show next.
 */
export function nextPhoneRecent(current: PaletteSlot | null, fromMore?: PaletteSlot): PaletteSlot | null {
  return fromMore && PHONE_MORE.includes(fromMore) ? fromMore : current;
}
