import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import { EditorFixture } from "../../../stories/fixtures";
import { useAnnotationUi } from "../../state/annotation-store";
import { PhoneTools } from "./PhoneTools";

const meta = {
  title: "Shell/PhoneTools",
  component: PhoneTools,
  globals: { viewport: { value: "phone" } },
  /** @returns Cleanup restoring the tool selection after the story. */
  beforeEach: () => {
    const previous = useAnnotationUi.getState();
    useAnnotationUi.getState().setTool("select");
    return () => useAnnotationUi.setState(previous);
  },
} satisfies Meta<typeof PhoneTools>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { keysEnabled: true, showTray: true },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <PhoneTools {...args} />
    </EditorFixture>
  ),
};

export const ToolCard: Story = {
  ...Default,
  /** @param context The rendered toolbar. @returns After checking the active tool and its restored card. */
  play: async ({ canvas, userEvent }) => {
    const draw = await canvas.findByRole("button", { name: /^Draw/ });
    await userEvent.click(draw);
    await canvas.findByRole("region", { name: "Draw" });
    await userEvent.click(draw);
    await waitFor(() => expect(canvas.queryByRole("region")).toBeNull());
    await expect(draw).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(draw);
    await canvas.findByRole("region", { name: "Draw" });
  },
};

export const CollapseOptions: Story = {
  ...Default,
  /** @param context The rendered toolbar. @returns After collapsing and reopening the options card. */
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Draw/ }));
    await canvas.findByRole("region", { name: "Draw" });
    await userEvent.click(canvas.getByRole("button", { name: "Collapse options" }));
    await canvas.findByRole("button", { name: /Expand Draw tool card/ });
    await userEvent.click(canvas.getByRole("button", { name: /Expand Draw tool card/ }));
    await canvas.findByRole("region", { name: "Draw" });
  },
};

export const MenuOpen: Story = {
  ...Default,
  /** @param context The rendered toolbar. @returns After checking menu dismissal and reopening it. */
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Draw/ }));
    await canvas.findByRole("region", { name: "Draw" });
    const markup = canvas.getByRole("button", { name: /^Markup/ });
    await userEvent.click(markup);
    await canvas.findByRole("menu", { name: "Markup" });
    await expect(canvas.queryByRole("region")).toBeNull();
    await userEvent.click(markup);
    await canvas.findByRole("region", { name: "Draw" });
    await userEvent.click(markup);
    await canvas.findByRole("menu", { name: "Markup" });
  },
};

export const CollapsedChip: Story = {
  ...Default,
  /** @param context The rendered toolbar. @returns After collapsing the open card by starting a page gesture. */
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Draw/ }));
    await canvas.findByRole("region", { name: "Draw" });
    window.dispatchEvent(new Event("phone-page-gesture"));
    await canvas.findByRole("button", { name: /Expand Draw tool card/ });
  },
};

export const SeeThrough: Story = {
  ...Default,
  /** @param context The rendered toolbar. @returns After a page gesture reaches the dock. */
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Draw/ }));
    await canvas.findByRole("region", { name: "Draw" });
    const bar = canvas.getByRole("toolbar");
    const detail = { pointerId: 7, clientY: bar.getBoundingClientRect().top + 4 };
    window.dispatchEvent(new CustomEvent("phone-page-gesture", { detail }));
    await waitFor(() => expect(bar).toHaveClass("opacity-20"));
  },
};
