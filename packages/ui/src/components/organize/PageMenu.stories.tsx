import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn, within } from "storybook/test";
import { PageMenu, type PageMenuAnchor } from "./PageMenu";
import { Button } from "../primitives/Button";

/** @param props Whether to show rail actions. @returns The anchored page actions. */
function Example({ rail = false }: { rail?: boolean }) {
  const [anchor, setAnchor] = useState<PageMenuAnchor | null>(null);
  return (
    <>
      <Button onClick={(event) => setAnchor({ id: "sample", element: event.currentTarget })}>Page actions</Button>
      {anchor && (
        <PageMenu
          rail={rail ? { count: 3, move: () => setAnchor(null) } : undefined}
          anchor={anchor}
          label="Page 1"
          number={1}
          narrow={false}
          canMove
          canDelete
          onDismiss={() => setAnchor(null)}
          onRotate={fn()}
          onDelete={fn()}
          onMove={fn()}
          onInsert={fn()}
          onExtract={fn()}
        />
      )}
    </>
  );
}
const meta = { title: "Organize/PageMenu", component: Example } satisfies Meta<typeof Example>;
export default meta;
export const Default: StoryObj<typeof meta> = {};

export const Rail: StoryObj<typeof meta> = {
  args: { rail: true },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Page actions" });
    await userEvent.click(trigger);
    const menu = within(await within(trigger.ownerDocument.body).findByRole("menu"));
    await menu.findByRole("textbox", { name: "Move page 1 to position" });
    await menu.findByRole("menuitem", { name: "Delete page" });
    if (menu.queryByText("Page 1")) throw new Error("Rail menu should not show a page title");
  },
};
