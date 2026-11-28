import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { field } from "../../../stories/sample-data";
import { FormChoice } from "./FormChoice";

const meta = { title: "Forms/FormChoice", component: FormChoice } satisfies Meta<typeof FormChoice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    widget: { ...field, kind: "choice", name: "Region", value: "North", options: ["North", "South"] },
    zoom: 1,
    commit: fn(),
  },
};
