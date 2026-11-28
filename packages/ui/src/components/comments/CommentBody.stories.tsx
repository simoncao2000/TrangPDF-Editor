import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommentBody } from "./CommentBody";

const plain = { bold: false, italic: false, underline: false, ink: "black" } as const;

const meta = {
  title: "Comments/CommentBody",
  component: CommentBody,
} satisfies Meta<typeof CommentBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Formatted: Story = {
  args: {
    body: [
      { ...plain, text: "Please check " },
      { ...plain, text: "the totals", bold: true, ink: "blue" },
      { ...plain, text: " before signing.\n" },
      { ...plain, text: "Confirm the date", italic: true, underline: true, ink: "teal" },
    ],
  },
};

export const LongUnbrokenText: Story = {
  args: {
    body: [{ ...plain, text: "reference-".repeat(16), ink: "plum" }],
  },
  /** @param args The comment props. @returns The comment in a narrow panel. */
  render: (args) => (
    <div className="w-56 border border-divider bg-raised p-3">
      <CommentBody {...args} />
    </div>
  ),
};
