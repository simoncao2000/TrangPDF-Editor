import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { percent } from "../../../stories/sample-data";
import { RangeField } from "./RangeField";

const meta = { title: "Primitives/RangeField", component: RangeField } satisfies Meta<typeof RangeField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "Opacity", value: 65, min: 0, max: 100, step: 5, format: percent, onCommit: fn() },
};
