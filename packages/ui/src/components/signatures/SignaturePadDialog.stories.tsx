import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../primitives/Button";
import { SignaturePadDialog } from "./SignaturePadDialog";
import { useSignatures } from "../../state/signature-store";

/** @returns A trigger and the resulting component. */
function Example() {
  return (
    <>
      <Button onClick={() => useSignatures.getState().setDrawing(true)}>Open signature pad</Button>
      <SignaturePadDialog />
    </>
  );
}

const meta = { title: "Signatures/SignaturePadDialog" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The interactive example. */
  render: () => <Example />,
};
