import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../stories/fixtures";
import { EditorApp } from "./EditorApp";

const meta = { title: "EditorApp", component: EditorApp } satisfies Meta<typeof EditorApp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <EditorApp {...args} />
    </EditorFixture>
  ),
};
