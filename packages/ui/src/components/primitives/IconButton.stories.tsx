import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus } from "lucide-react";
import { fn } from "storybook/test";
import { IconButton } from "./IconButton";

const meta = { title: "Primitives/IconButton", component: IconButton } satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { icon: Plus, label: "Add page", onClick: fn() } };
