import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { SearchHighlight } from "./SearchHighlight";

const meta = { title: "Viewer/SearchHighlight" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture scenario="search">
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page, zoom, width, height }) => <SearchHighlight page={page} zoom={zoom} width={width} height={height} />}
      </PageFixture>
    </EditorFixture>
  ),
};
