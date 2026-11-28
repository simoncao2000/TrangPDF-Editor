import type { Meta, StoryObj } from "@storybook/react-vite";
import { PaperBoat } from "./PaperBoat";

const meta = { title: "Primitives/PaperBoat", component: PaperBoat } satisfies Meta<typeof PaperBoat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { className: "w-24" } };
