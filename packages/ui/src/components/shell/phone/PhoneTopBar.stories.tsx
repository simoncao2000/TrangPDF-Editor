import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../../stories/fixtures";
import { PhoneTopBar } from "./PhoneTopBar";

const meta = { title: "Shell/Phone/PhoneTopBar", component: PhoneTopBar } satisfies Meta<typeof PhoneTopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <PhoneTopBar {...args} />
    </EditorFixture>
  ),
};
