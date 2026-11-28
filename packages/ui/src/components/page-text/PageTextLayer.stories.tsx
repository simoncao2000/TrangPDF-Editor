import { PageCanvas } from "../viewer/PageCanvas";
import { AnnotationLayer } from "../annotations/AnnotationLayer";
import { PageViewport } from "../viewer/PageViewport";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { PageTextLayer } from "./PageTextLayer";

const meta = { title: "Page Text/PageTextLayer" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture scenario="editText">
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page, zoom, width, height }) => <PageTextLayer page={page} zoom={zoom} width={width} height={height} />}
      </PageFixture>
    </EditorFixture>
  ),
};

export const ClickToEditDragToSelect: Story = {
  parameters: {
    docs: { description: { story: "Click a line to edit it, or drag from its edge or center to select text." } },
  },
  /** @returns A Select surface with editable lines and markup on the first line. */
  render: () => (
    <EditorFixture sample="highlighted">
      <PageViewport narrow={false} />
    </EditorFixture>
  ),
};

export const TouchSelect: Story = {
  /** @returns The text layer within its zoomable viewport. */
  render: () => (
    <EditorFixture sample="text">
      <PageViewport narrow />
    </EditorFixture>
  ),
};

export const HighlightedLine: Story = {
  /** @returns An editable first line with a selectable highlight on top. */
  render: () => (
    <EditorFixture sample="highlighted">
      <PageFixture scenario="editText">
        {/** @param sample The sample page and dimensions. @returns Its interactive page layers. */}
        {({ page, zoom, width, height }) => (
          <>
            <PageCanvas
              docId={page.docId}
              pageIndex={page.sourceIndex}
              rotation={page.rotation}
              revision={page.revision}
              hideEditable
              width={width}
              height={height}
              priority={0}
            />
            <PageTextLayer page={page} zoom={zoom} width={width} height={height} />
            <AnnotationLayer page={page} zoom={zoom} width={width} height={height} />
          </>
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
