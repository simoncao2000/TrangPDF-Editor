import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { ViewerScreen } from "./ViewerScreen";

const meta = { title: "Viewer/ViewerScreen", component: ViewerScreen } satisfies Meta<typeof ViewerScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { narrow: false, dragging: false, keysEnabled: true },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <ViewerScreen {...args} />
    </EditorFixture>
  ),
};
