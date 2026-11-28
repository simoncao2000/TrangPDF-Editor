import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ToolGroupButton } from "./ToolGroupButton";

const meta = { title: "Shell/ToolGroupButton", component: ToolGroupButton } satisfies Meta<typeof ToolGroupButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "Markup",
    tools: ["highlight", "underline"],
    current: "highlight",
    upright: false,
    disabled: false,
    onPick: fn(),
  },
};
