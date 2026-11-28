import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { ToolPalette } from "./ToolPalette";

const meta = { title: "Shell/ToolPalette", component: ToolPalette } satisfies Meta<typeof ToolPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { area: { width: 900, height: 600 }, keysEnabled: true },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <ToolPalette {...args} />
    </EditorFixture>
  ),
};
