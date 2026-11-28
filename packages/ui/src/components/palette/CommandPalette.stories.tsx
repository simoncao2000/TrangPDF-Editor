import { expect, userEvent } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { CommandPalette } from "./CommandPalette";

const meta = { title: "Palette/CommandPalette", component: CommandPalette } satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/?panel=search">
      <CommandPalette {...args} />
    </EditorFixture>
  ),
};

export const PhoneNarrow: Story = {
  ...Default,
  globals: { viewport: { value: "phone" } },
  /** @param context The rendered palette. @returns After checking the phone search field. */
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("combobox")).toHaveAttribute("placeholder", "Search this file");
    await expect(canvas.queryByText(/Type > to run a command/)).toBeNull();
  },
};

export const SearchDocument: Story = {
  ...Default,
  /** @param context The rendered palette. @returns After the corpus search finishes. */
  play: async ({ canvas }) => {
    await userEvent.type(await canvas.findByRole("combobox"), "zzzx");
    await expect(await canvas.findByText("Nothing found in this file or the open files.")).toBeVisible();
  },
};
