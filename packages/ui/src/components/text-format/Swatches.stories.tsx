import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Swatches } from "./ColourPicker";

const meta = { title: "Text Formatting/Swatches", component: Swatches } satisfies Meta<typeof Swatches>;
export default meta;
export const Default: StoryObj<typeof meta> = {
  args: {
    title: "Page colours",
    items: [
      ["Butter", "#f4d97e"],
      ["Mint", "#a8dcc4"],
    ],
    color: "#f4d97e",
    onChange: fn(),
  },
};
