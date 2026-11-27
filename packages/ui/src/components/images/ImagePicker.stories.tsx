import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImagePicker } from "./ImagePicker";

const meta = { title: "Images/ImagePicker", component: ImagePicker } satisfies Meta<typeof ImagePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
