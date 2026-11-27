import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TypeSignature } from "./TypeSignature";

const meta = { title: "Signatures/TypeSignature", component: TypeSignature } satisfies Meta<typeof TypeSignature>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { onCancel: fn(), onUse: fn() } };
