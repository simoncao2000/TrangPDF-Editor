import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { body } from "../../../stories/sample-data";
import { CommentComposer } from "./CommentComposer";

const meta = { title: "Comments/CommentComposer", component: CommentComposer } satisfies Meta<typeof CommentComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { placeholder: "Reply…", initial: body, autoFocus: true, onSubmit: fn() } };
