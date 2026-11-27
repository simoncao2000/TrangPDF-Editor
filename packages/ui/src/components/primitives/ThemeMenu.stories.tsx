import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeMenu } from "./ThemeMenu";

const meta = { title: "Primitives/ThemeMenu", component: ThemeMenu } satisfies Meta<typeof ThemeMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
