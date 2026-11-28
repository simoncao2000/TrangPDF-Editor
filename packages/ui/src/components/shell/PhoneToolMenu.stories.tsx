import type { Meta, StoryObj } from "@storybook/react-vite";
import { TOOL_INFO } from "../../editor/tool-catalog";
import { fn } from "storybook/test";
import { PhoneToolMenu } from "./PhoneToolMenu";

const meta = {
  title: "Shell/PhoneToolMenu",
  component: PhoneToolMenu,
  decorators: [
    /** @param Story The anchored menu. @returns A bottom anchor with space for the rising rows. */
    (Story) => (
      <div className="absolute right-4 bottom-12">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PhoneToolMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Markup",
    open: true,
    rows: [TOOL_INFO.highlight, TOOL_INFO.underline],
    checked: "highlight",
    onPick: fn(),
  },
};
