import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { PageControl } from "./PageControl";

const meta = {
  title: "Viewer/PageControl",
  component: PageControl,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center *:pointer-events-auto">
        <PageControl {...args} />
      </div>
    </EditorFixture>
  ),
};
