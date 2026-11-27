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

export const TouchSelect: Story = {
  /** @returns The text layer within its zoomable viewport. */
  render: () => (
    <EditorFixture sample="text">
      <PageViewport narrow />
    </EditorFixture>
  ),
};
