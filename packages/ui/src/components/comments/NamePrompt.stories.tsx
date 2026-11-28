import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { NamePrompt } from "./NamePrompt";

const meta = { title: "Comments/NamePrompt", component: NamePrompt } satisfies Meta<typeof NamePrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { initial: "Linh", submitLabel: "Save name", onSave: fn() } };
