import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { TitleBar } from "./TitleBar";

const meta = { title: "Shell/TitleBar", component: TitleBar } satisfies Meta<typeof TitleBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { keysEnabled: true },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <TitleBar {...args} />
    </EditorFixture>
  ),
};
