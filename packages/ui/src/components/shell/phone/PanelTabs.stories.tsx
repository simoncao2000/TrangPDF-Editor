import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../../stories/fixtures";
import { PanelTabs } from "./PanelTabs";

const meta = { title: "Shell/Phone/PanelTabs", component: PanelTabs } satisfies Meta<typeof PanelTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { threadCount: 2, progress: { done: 1, total: 3 } },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <PanelTabs {...args} />
    </EditorFixture>
  ),
};

export const BeforePanelScan: Story = { ...Default, args: { threadCount: 0 } };
