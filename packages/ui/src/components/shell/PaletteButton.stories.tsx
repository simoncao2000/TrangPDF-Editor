import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus } from "lucide-react";
import { fn } from "storybook/test";
import { PaletteButton } from "./PaletteButton";

const meta = { title: "Shell/PaletteButton", component: PaletteButton } satisfies Meta<typeof PaletteButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { icon: Plus, label: "Add page", shortcut: "A", onClick: fn() } };
