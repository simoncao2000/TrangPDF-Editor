import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { Workbench } from "./Workbench";

const meta = { title: "Shell/Workbench", component: Workbench } satisfies Meta<typeof Workbench>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { keysEnabled: true },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <Workbench {...args} />
    </EditorFixture>
  ),
};
