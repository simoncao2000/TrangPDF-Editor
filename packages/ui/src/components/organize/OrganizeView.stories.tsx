import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { OrganizeView } from "./OrganizeView";

const meta = { title: "Organize/OrganizeView", component: OrganizeView } satisfies Meta<typeof OrganizeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/?mode=organize">
      <OrganizeView {...args} />
    </EditorFixture>
  ),
};
