import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ColourPicker } from "./ColourPicker";

const meta = { title: "Text Formatting/ColourPicker", component: ColourPicker } satisfies Meta<typeof ColourPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { color: "#295d77", pageColors: ["#f4d97e", "#a8dcc4"], onChange: fn() } };
