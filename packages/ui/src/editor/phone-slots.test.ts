import { expect, test } from "bun:test";
import { nextPhoneRecent, PHONE_FIXED, PHONE_MORE, phoneSlotId } from "./phone-slots";
import { PALETTE } from "./tool-catalog";

/**
 * Checks that every non-fixed palette slot appears nearest-first.
 * @returns Nothing.
 */
function checkMore() {
  expect(PHONE_FIXED.map(phoneSlotId)).toEqual(["select", "Markup", "ink", "note"]);
  expect(PHONE_MORE).toEqual(PALETTE.filter((slot) => !PHONE_FIXED.includes(slot)).reverse());
  expect(PHONE_MORE.map(phoneSlotId)).toEqual(["sign", "image", "textBox", "Shapes", "editText"]);
}

/**
 * Checks that only More picks replace the retained slot, including group picks.
 * @returns Nothing.
 */
function checkRecent() {
  const sign = PHONE_MORE.find((slot) => phoneSlotId(slot) === "sign");
  const shapes = PHONE_MORE.find((slot) => phoneSlotId(slot) === "Shapes");

  if (!sign || !shapes) throw new Error("The More column must contain Sign and Shapes.");

  expect(nextPhoneRecent(null)).toBeNull();
  expect(nextPhoneRecent(null, PHONE_FIXED[0])).toBeNull();
  expect(nextPhoneRecent(null, sign)).toBe(sign);
  expect(nextPhoneRecent(sign)).toBe(sign);
  expect(nextPhoneRecent(sign, PHONE_FIXED[1])).toBe(sign);
  expect(nextPhoneRecent(sign, shapes)).toBe(shapes);
  expect(nextPhoneRecent(shapes)).toBe(shapes);
}

test("the More column contains every non-fixed slot in reverse palette order", checkMore);
test("the recent slot changes only when a slot is picked from More", checkRecent);
