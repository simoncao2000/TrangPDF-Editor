import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { NewTextEditor } from "./NewTextEditor";

const meta = { title: "Annotations/NewTextEditor" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page, frame }) => (
          <NewTextEditor pageId={page.id} revision={page.revision} at={{ x: 50, y: 65 }} frame={frame} onDone={fn()} />
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
