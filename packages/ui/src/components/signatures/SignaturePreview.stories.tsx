import type { Meta, StoryObj } from "@storybook/react-vite";
import { signature } from "../../../stories/sample-data";
import { SignaturePreview } from "./SignaturePreview";

const meta = { title: "Signatures/SignaturePreview", component: SignaturePreview } satisfies Meta<
  typeof SignaturePreview
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { signature } };
