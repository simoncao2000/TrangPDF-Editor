import { within } from "storybook/test";
import { useAnnotationUi } from "../src/state/annotation-store";
import { useSignatures } from "../src/state/signature-store";
import { signature } from "./sample-data";

/** @returns Cleanup restoring the user's signature library and tool. */
export function seedSignatures() {
  const library = useSignatures.getState();
  const ui = useAnnotationUi.getState();
  useSignatures.setState({ signatures: [signature], currentId: signature.id, temporary: null });
  ui.setTool("sign");
  return () => {
    useSignatures.setState(library);
    useAnnotationUi.setState(ui);
  };
}

/** @param context The mounted story. @returns Completion once the ghost is over the page. */
export async function dragSample({ canvasElement }: { canvasElement: HTMLElement }) {
  const tile = await within(canvasElement).findByRole("button", { name: `Use signature: ${signature.text}` });
  const page = await within(canvasElement).findByRole("group", { name: "Page 1" });
  const tileBox = tile.getBoundingClientRect();
  const pageBox = page.getBoundingClientRect();
  const pointer = { bubbles: true, isPrimary: true, pointerType: "mouse", pointerId: 1, buttons: 1 };
  // Synthetic story pointers have no browser capture slot. Deliver both events directly to the tile.
  Object.defineProperty(tile, "setPointerCapture", { configurable: true, value: () => undefined });
  try {
    tile.dispatchEvent(
      new PointerEvent("pointerdown", { ...pointer, clientX: tileBox.left + 12, clientY: tileBox.top }),
    );
    tile.dispatchEvent(
      new PointerEvent("pointermove", {
        ...pointer,
        clientX: pageBox.left + pageBox.width / 2,
        clientY: pageBox.top + 80,
      }),
    );
  } finally {
    Reflect.deleteProperty(tile, "setPointerCapture");
  }
}
