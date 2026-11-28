import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { ThumbnailRail } from "./ThumbnailRail";

const meta = { title: "Viewer/ThumbnailRail", component: ThumbnailRail } satisfies Meta<typeof ThumbnailRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <div style={{ height: 360, display: "grid" }}>
        <ThumbnailRail {...args} />
      </div>
    </EditorFixture>
  ),
};
