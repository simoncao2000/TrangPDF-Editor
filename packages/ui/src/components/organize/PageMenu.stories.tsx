import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { PageMenu, type PageMenuAnchor } from "./PageMenu";
import { Button } from "../primitives/Button";

/** @returns The page actions anchored to a story button. */
function Example() {
  const [anchor, setAnchor] = useState<PageMenuAnchor | null>(null);
  return (
    <>
      <Button onClick={(event) => setAnchor({ id: "sample", element: event.currentTarget })}>Page actions</Button>
      {anchor && (
        <PageMenu
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
