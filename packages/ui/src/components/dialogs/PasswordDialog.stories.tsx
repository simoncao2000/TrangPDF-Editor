import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { PasswordDialog } from "./PasswordDialog";

const meta = { title: "Dialogs/PasswordDialog", component: PasswordDialog } satisfies Meta<typeof PasswordDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="encrypted" path="/">
      <PasswordDialog {...args} />
    </EditorFixture>
  ),
};
