import type { Meta, StoryObj } from "@storybook/react-vite";
import { SWATCHES } from "../../state/annotation-store";
import { fn } from "storybook/test";
import { color } from "../../../stories/sample-data";
import { ColorSwatches } from "./ColorSwatches";

const meta = { title: "Primitives/ColorSwatches", component: ColorSwatches } satisfies Meta<typeof ColorSwatches>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { label: "Ink", swatches: SWATCHES, value: color, onChange: fn() } };
