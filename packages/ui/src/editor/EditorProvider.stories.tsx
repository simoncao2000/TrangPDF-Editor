import type { Meta, StoryObj } from "@storybook/react-vite";
import { useDocument } from "./hooks";
import { EditorFixture } from "../../stories/fixtures";

/** @returns The active file provided to a consumer. */
function DocumentName() {
  const name = useDocument((state) => state.fileName);
  return <p>{name}</p>;
}

const meta = { title: "Editor/EditorProvider" } satisfies Meta;
export default meta;
export const Default: StoryObj<typeof meta> = {
  /** @returns The provider and a document state consumer. */
  render: () => (
    <EditorFixture>
      <DocumentName />
    </EditorFixture>
  ),
};
