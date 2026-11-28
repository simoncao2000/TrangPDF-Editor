import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PhonePageBar } from "./PhonePageBar";

const meta = { title: "Organize/PhonePageBar", component: PhonePageBar } satisfies Meta<typeof PhonePageBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    count: 2,
    canDelete: true,
    busy: false,
    onClear: fn(),
    onSelectAll: fn(),
    onInsert: fn(),
    onRead: fn(),
    onRotate: fn(),
    onExtract: fn(),
    onDelete: fn(),
    onMore: fn(),
  },
};
