import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../components/primitives/Button";
import { useOpenPanel } from "./hooks";
import { EditorFixture } from "../../stories/fixtures";

/** @returns A button that updates the preview's in-memory route. */
function PanelNavigation() {
  const { panel, openPanel, closePanel } = useOpenPanel();
  return panel === "comments" ? (
    <Button onClick={() => closePanel()}>Close comments</Button>
  ) : (
    <Button onClick={() => openPanel("comments")}>Open comments</Button>
  );
}

const meta = { title: "Editor/EditorRouter" } satisfies Meta;
export default meta;
export const Default: StoryObj<typeof meta> = {
  /** @returns The router and a route state consumer. */
  render: () => (
    <EditorFixture sample="empty">
      <PanelNavigation />
    </EditorFixture>
  ),
};
