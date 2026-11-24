import { PALETTE, type PaletteSlot } from "./tool-catalog";

/**
 * Returns the identity shared by a palette slot and its phone placement.
 * @param slot The palette slot.
 * @returns The tool or group identifier.
 */
export function phoneSlotId(slot: PaletteSlot) {
  return slot.kind === "tool" ? slot.tool : slot.name;
}

const ORDER = ["select", "Markup", "ink", "note", "textBox", "sign", "Shapes", "image", "editText"];
const ORDERED = ORDER.flatMap((id) => PALETTE.filter((slot) => phoneSlotId(slot) === id));

/** @param width The page area's CSS width. @returns The primary slots and the slots available under More. */
export function fitPhoneSlots(width: number) {
  const capacity = Math.max(0, Math.floor((width - 24) / 48));
  const count = Math.min(capacity, ORDERED.length);
  return { visible: ORDERED.slice(0, count), hidden: ORDERED.slice(count) };
}
