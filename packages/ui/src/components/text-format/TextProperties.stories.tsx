import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { TextProperties } from "./TextProperties";

const meta = { title: "Text Formatting/TextProperties", component: TextProperties } satisfies Meta<
  typeof TextProperties
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <TextProperties {...args} />
    </EditorFixture>
  ),
};
