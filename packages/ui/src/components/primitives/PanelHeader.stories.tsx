import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { PanelHeader } from "./PanelHeader";

const meta = {
  title: "Primitives/PanelHeader",
  component: PanelHeader,
  args: { id: "panel-title", title: "Pages" },
} satisfies Meta<typeof PanelHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Narrow: Story = {
  args: {
    title: "Pages in the current document",
    actions: <Button variant="ghost">Add</Button>,
  },
  /** @param args The header props. @returns The header in a narrow sidebar. */
  render: (args) => (
    <div className="w-48 border border-divider bg-rail">
      <PanelHeader {...args} />
    </div>
  ),
};
