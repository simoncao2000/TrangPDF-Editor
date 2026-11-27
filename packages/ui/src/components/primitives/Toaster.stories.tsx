import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "./Button";
import { Toaster } from "./Toaster";
import { useToast } from "../../state/toast-store";

/** @returns A trigger and the resulting component. */
function Example() {
  return (
    <>
      <Button onClick={() => useToast.getState().show("Page deleted.", { action: { label: "Undo", run: fn() } })}>
        Show toast
      </Button>
      <Toaster />
    </>
  );
}

const meta = { title: "Primitives/Toaster" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The interactive example. */
  render: () => <Example />,
};
