import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { PhoneShell } from "./PhoneShell";

const meta = { title: "Shell/PhoneShell", component: PhoneShell } satisfies Meta<typeof PhoneShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { keysEnabled: true },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <PhoneShell {...args} />
    </EditorFixture>
  ),
};
