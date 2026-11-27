import { EditorFixture } from "../../../stories/fixtures";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { OpenErrorDialog } from "./OpenErrorDialog";

const meta = { title: "Dialogs/OpenErrorDialog", component: OpenErrorDialog } satisfies Meta<typeof OpenErrorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <EditorFixture sample="empty">
      <OpenErrorDialog {...args} />
    </EditorFixture>
  ),
  args: { kind: "damaged", fileName: "Sample.pdf", onClose: fn() },
};
