import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { field } from "../../../stories/sample-data";
import { FormText } from "./FormText";

const meta = { title: "Forms/FormText", component: FormText } satisfies Meta<typeof FormText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { widget: field, zoom: 1, commit: fn() } };
