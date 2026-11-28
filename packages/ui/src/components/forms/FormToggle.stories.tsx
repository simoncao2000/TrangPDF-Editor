import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { field } from "../../../stories/sample-data";
import { FormToggle } from "./FormToggle";

const meta = { title: "Forms/FormToggle", component: FormToggle } satisfies Meta<typeof FormToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { widget: { ...field, kind: "checkbox", name: "Approved", checked: true }, pageId: "sample", commit: fn() },
};
