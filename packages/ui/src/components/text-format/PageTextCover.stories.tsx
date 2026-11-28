import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageTextCover } from "./PageTextCover";

const meta = { title: "Text Formatting/PageTextCover", component: PageTextCover } satisfies Meta<typeof PageTextCover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { background: "#ffffff", width: 220, height: 38, children: "An editable line of PDF text" },
};
