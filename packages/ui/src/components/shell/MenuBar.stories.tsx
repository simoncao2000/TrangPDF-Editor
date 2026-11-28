import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { MenuBar } from "./MenuBar";

const meta = { title: "Shell/MenuBar", component: MenuBar } satisfies Meta<typeof MenuBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <MenuBar {...args} />
    </EditorFixture>
  ),
};
