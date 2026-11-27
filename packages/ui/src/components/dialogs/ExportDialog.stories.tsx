import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../primitives/Button";
import { ExportDialog } from "./ExportDialog";
import { useExport } from "../../editor/use-export";
import { EditorFixture } from "../../../stories/fixtures";

/** @returns A trigger and the resulting component. */
function Example() {
  return (
    <>
      <Button onClick={() => useExport.getState().open("all")}>Open export dialog</Button>
      <ExportDialog />
    </>
  );
}

const meta = { title: "Dialogs/ExportDialog" } satisfies Meta;
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
