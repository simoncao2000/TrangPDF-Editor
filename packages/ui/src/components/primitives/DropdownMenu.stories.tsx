import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { menuLabel } from "../../../stories/sample-data";
import { DropdownMenu } from "./DropdownMenu";

const meta = { title: "Primitives/DropdownMenu", component: DropdownMenu } satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Zoom",
    triggerLabel: "Zoom",
    renderTrigger: menuLabel,
    entries: [
      { value: "fit", label: "Fit page" },
      { value: "actual", label: "Actual size" },
    ],
    value: "fit",
    onSelect: fn(),
  },
};
