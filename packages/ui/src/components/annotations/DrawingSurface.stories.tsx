import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { toolStyle } from "../../../stories/sample-data";
import { DrawingSurface } from "./DrawingSurface";

const meta = { title: "Annotations/DrawingSurface" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page, frame, width, height }) => (
          <DrawingSurface
            pageId={page.id}
            tool="square"
            style={toolStyle}
            frame={frame}
            width={width}
            height={height}
            onCreate={fn()}
            onTextAt={fn()}
          />
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
