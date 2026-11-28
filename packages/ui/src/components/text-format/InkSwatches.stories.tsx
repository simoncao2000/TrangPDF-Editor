import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { InkSwatches } from "./ColourPicker";

const meta = { title: "Text Formatting/InkSwatches", component: InkSwatches } satisfies Meta<typeof InkSwatches>;
export default meta;
export const Default: StoryObj<typeof meta> = { args: { color: "#295d77", onChange: fn() } };
