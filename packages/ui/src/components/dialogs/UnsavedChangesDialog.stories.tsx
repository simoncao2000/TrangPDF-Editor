import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../primitives/Button";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { useLeaveGuard } from "../../editor/leave-guard";
import { EditorFixture } from "../../../stories/fixtures";

/** @returns A trigger and the resulting component. */
function Example() {
  return (
    <>
      <Button onClick={() => useLeaveGuard.getState().ask(fn())}>Open unsaved changes prompt</Button>
      <UnsavedChangesDialog />
    </>
  );
}

const meta = { title: "Dialogs/UnsavedChangesDialog" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The interactive example. */
  render: () => (
    <EditorFixture>
      <Example />
    </EditorFixture>
  ),
};
