import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture, PageFixture, TextObjectFixture } from "../../../stories/fixtures";
import { DraggedText } from "./DraggedText";

const meta = { title: "Page Text/DraggedText" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page, frame }) => (
          <TextObjectFixture pageId={page.id}>
            {(object) => <DraggedText pageId={page.id} object={object} offset={{ x: 20, y: 12 }} frame={frame} />}
          </TextObjectFixture>
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
