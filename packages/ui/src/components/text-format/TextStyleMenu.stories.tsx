import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { fn } from "storybook/test";
import { TextStyleMenu } from "./TextStyleMenu";
import { textStyle } from "../../../stories/sample-data";

/** @returns The text colour popover attached to its trigger. */
function Example() {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" ref={trigger} onClick={() => setOpen(!open)}>
        Text colour
      </button>
      {open && (
        <TextStyleMenu
          blockText=""
          hasDraft={false}
          pageId=""
          selectionText=""
          panel="colour"
          style={textStyle}
          pageColors={["#f4d97e"]}
          wide
          trigger={trigger}
          closing={false}
          onChange={fn()}
          onDismiss={() => setOpen(false)}
        />
      )}
    </>
  );
}
const meta = { title: "Text Formatting/TextStyleMenu", component: Example } satisfies Meta<typeof Example>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
