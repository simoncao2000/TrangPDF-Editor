import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { StartScreen } from "./StartScreen";

const meta = { title: "Start/StartScreen", component: StartScreen } satisfies Meta<typeof StartScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { dragging: false },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="empty" path="/">
      <StartScreen {...args} />
    </EditorFixture>
  ),
};
