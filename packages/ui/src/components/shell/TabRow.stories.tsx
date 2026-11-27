import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { TabRow } from "./TabRow";

const meta = { title: "Shell/TabRow", component: TabRow } satisfies Meta<typeof TabRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <TabRow {...args} />
    </EditorFixture>
  ),
};
