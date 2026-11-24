import { expect, test } from "bun:test";
import { fitPhoneSlots, phoneSlotId } from "./phone-slots";

test("the bar shows every slot that fits, in palette order", () => {
  for (const [width, visibleCount] of [
    [390, 7],
    [420, 8],
    [455, 8],
    [520, 9],
    [900, 9],
  ] as const) {
    const slots = fitPhoneSlots(width);
    expect(slots.visible).toHaveLength(visibleCount);
    expect(slots.hidden).toHaveLength(9 - visibleCount);
    expect([...slots.visible, ...slots.hidden].map(phoneSlotId)).toEqual([
      "select",
      "Markup",
      "ink",
      "note",
      "textBox",
      "sign",
      "Shapes",
      "image",
      "editText",
    ]);
  }
  expect(fitPhoneSlots(390).visible.map(phoneSlotId)).toEqual([
    "select",
    "Markup",
    "ink",
    "note",
    "textBox",
    "sign",
    "Shapes",
  ]);
});
