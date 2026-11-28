import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { SelectedText } from "./SelectedText";

const meta = { title: "Page Text/SelectedText" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture scenario="selection">
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page, frame, width, height }) => (
          <SelectedText pageId={page.id} frame={frame} width={width} height={height} />
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
