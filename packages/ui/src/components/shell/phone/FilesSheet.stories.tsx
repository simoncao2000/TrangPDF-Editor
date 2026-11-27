import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture } from "../../../../stories/fixtures";
import { FilesSheet } from "./FilesSheet";

const meta = { title: "Shell/Phone/FilesSheet", component: FilesSheet } satisfies Meta<typeof FilesSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { onClose: fn() },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <FilesSheet {...args} />
    </EditorFixture>
  ),
};
