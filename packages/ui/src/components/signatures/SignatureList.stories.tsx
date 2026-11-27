import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignatureList } from "./SignatureList";

const meta = { title: "Signatures/SignatureList", component: SignatureList } satisfies Meta<typeof SignatureList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
