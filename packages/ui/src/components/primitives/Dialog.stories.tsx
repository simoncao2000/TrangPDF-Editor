import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/**
 * Opens and dismisses the same native modal used by the editor.
 * @param props The title, description and tone to preview.
 * @returns The trigger and its dialog.
 */
function DialogExample({
  title,
  description,
  tone,
}: Pick<React.ComponentProps<typeof Dialog>, "title" | "description" | "tone">) {
  const [open, setOpen] = useState(false);

  /** @returns Nothing. */
  const dismiss = () => setOpen(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      {open && (
        <Dialog
          title={title}
          description={description}
          tone={tone}
          onDismiss={dismiss}
          actions={
            <>
              <Button onClick={dismiss}>Cancel</Button>
              <Button variant="primary" onClick={dismiss}>
                Confirm
              </Button>
            </>
          }
        />
      )}
    </>
  );
}

const meta = {
  title: "Primitives/Dialog",
  component: DialogExample,
  args: { title: "Close document?", description: "Unsaved changes will be lost." },
  argTypes: { tone: { control: "select", options: ["neutral", "danger"] } },
} satisfies Meta<typeof DialogExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmation: Story = {};
export const Destructive: Story = { args: { title: "Delete page?", tone: "danger" } };
