import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { PageCanvas } from "./PageCanvas";

const meta = { title: "Viewer/PageCanvas" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page, width, height }) => (
          <PageCanvas
            docId={page.docId}
            pageIndex={page.sourceIndex}
            rotation={page.rotation}
            revision={page.revision}
            width={width}
            height={height}
            priority={0}
          />
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
