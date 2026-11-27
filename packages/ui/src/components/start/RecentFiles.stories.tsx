import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { RecentFiles } from "./RecentFiles";

const meta = { title: "Start/RecentFiles", component: RecentFiles } satisfies Meta<typeof RecentFiles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="empty" path="/">
      <RecentFiles {...args} />
    </EditorFixture>
  ),
};
