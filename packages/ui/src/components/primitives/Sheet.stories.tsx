import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Sheet } from "./Sheet";

const meta = { title: "Primitives/Sheet", component: Sheet } satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: "Pages", meta: "3 pages", children: "Choose a page to continue.", onDismiss: fn() },
};
