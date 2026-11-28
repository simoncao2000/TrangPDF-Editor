import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture, PageFixture, TextObjectFixture } from "../../../stories/fixtures";
import { PageTextEditor } from "./PageTextEditor";

const meta = { title: "Page Text/PageTextEditor" } satisfies Meta;

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
            {(object) => (
              <PageTextEditor pageId={page.id} revision={page.revision} frame={frame} object={object} onDone={fn()} />
            )}
          </TextObjectFixture>
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
