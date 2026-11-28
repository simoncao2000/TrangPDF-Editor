import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";
import { EditorFixture } from "../../../stories/fixtures";
import { ThumbnailRail } from "./ThumbnailRail";

const meta = { title: "Viewer/ThumbnailRail", component: ThumbnailRail } satisfies Meta<typeof ThumbnailRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="threePages" path="/">
      <div style={{ height: 360, display: "grid" }}>
        <ThumbnailRail {...args} />
      </div>
    </EditorFixture>
  ),
};

export const AddTile: Story = {
  ...Default,
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "Page 1" });
    const list = canvas.getByRole("list").parentElement!;
    list.scrollTop = list.scrollHeight;
    await canvas.findByRole("button", { name: "Add pages" });
  },
};

export const OpenPageMenu: Story = {
  ...Default,
  play: async ({ canvas }) => {
    const page = await canvas.findByRole("button", { name: "Page 1" });
    const rect = page.getBoundingClientRect();
    fireEvent.contextMenu(page, { clientX: rect.left + 12, clientY: rect.top + 12 });
    const menu = within(await within(page.ownerDocument.body).findByRole("menu", { name: "Actions for page 1" }));
    await menu.findByRole("textbox", { name: "Move page 1 to position" });
    if (menu.queryByText("Page 1")) throw new Error("Rail menu should not show a page title");
  },
};

export const MoveFromMenu: Story = {
  ...Default,
  play: async ({ canvas, userEvent }) => {
    const page = await canvas.findByRole("button", { name: "Page 1" });
    fireEvent.contextMenu(page);
    const menu = within(await within(page.ownerDocument.body).findByRole("menu"));
    const input = menu.getByRole("textbox", { name: "Move page 1 to position" });
    await userEvent.keyboard("{ArrowDown}");
    await expect(menu.getByRole("menuitem", { name: "Delete page" })).toHaveFocus();
    await userEvent.keyboard("4{Enter}");
    await expect(menu.getByText("1–3")).toBeVisible();
    await expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.keyboard("3{Enter}");
    await waitFor(() => expect(page).toHaveFocus());
    await expect(page).toHaveAccessibleName("Page 3");
    await waitFor(() => expect(page).toHaveAttribute("aria-current", "page"));
  },
};

export const DragInProgress: Story = {
  ...Default,
  play: async ({ canvas, userEvent }) => {
    const page = await canvas.findByRole("button", { name: "Page 1" });
    page.focus();
    await userEvent.keyboard("m{ArrowDown}");
  },
};
