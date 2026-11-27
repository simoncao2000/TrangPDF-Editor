import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { textStyle } from "../../../stories/sample-data";
import { FormatBar } from "./FormatBar";

const meta = { title: "Text Formatting/FormatBar", component: FormatBar } satisfies Meta<typeof FormatBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { style: textStyle, panel: null, onPanel: fn(), onSize: fn(), onToggle: fn() } };
