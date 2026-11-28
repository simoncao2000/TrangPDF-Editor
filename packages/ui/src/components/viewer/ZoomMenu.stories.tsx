import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { ZoomMenu } from "./ZoomMenu";

const meta = { title: "Viewer/ZoomMenu", component: ZoomMenu } satisfies Meta<typeof ZoomMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <ZoomMenu {...args} />
    </EditorFixture>
  ),
};
