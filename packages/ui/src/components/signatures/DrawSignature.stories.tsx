import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DrawSignature } from "./DrawSignature";

const meta = { title: "Signatures/DrawSignature", component: DrawSignature } satisfies Meta<typeof DrawSignature>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { onCancel: fn(), onUse: fn() } };
