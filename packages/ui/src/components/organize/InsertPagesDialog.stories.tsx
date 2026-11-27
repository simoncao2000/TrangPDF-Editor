import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { positions } from "../../../stories/sample-data";
import { InsertPagesDialog } from "./InsertPagesDialog";

const meta = { title: "Organize/InsertPagesDialog", component: InsertPagesDialog } satisfies Meta<
  typeof InsertPagesDialog
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { fileName: "Appendix.pdf", pageCount: 2, positions, onInsert: fn(), onCancel: fn() },
};
