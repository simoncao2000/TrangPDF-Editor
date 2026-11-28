import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SelectionBar } from "./SelectionBar";

const meta = { title: "Organize/SelectionBar", component: SelectionBar } satisfies Meta<typeof SelectionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    count: 2,
    canDelete: true,
    busy: false,
    onRotateLeft: fn(),
    onRotateRight: fn(),
    onExtract: fn(),
    onDelete: fn(),
    onClear: fn(),
  },
};
