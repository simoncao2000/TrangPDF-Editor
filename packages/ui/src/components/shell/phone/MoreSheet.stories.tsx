import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen } from "storybook/test";
import { EditorFixture } from "../../../../stories/fixtures";
import { MoreSheet } from "./MoreSheet";

const meta = { title: "Shell/Phone/MoreSheet", component: MoreSheet } satisfies Meta<typeof MoreSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/?panel=more">
      <MoreSheet {...args} />
    </EditorFixture>
  ),
};

export const ThemeExpanded: Story = {
  ...Default,
  /** @param context The rendered sheet. @returns After opening the theme rows. */
  play: async ({ userEvent }) => {
    await userEvent.click(await screen.findByText("Theme", { selector: "summary" }));
  },
};
