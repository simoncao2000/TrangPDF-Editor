import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { mark } from "../../../stories/sample-data";
import { CommentThread } from "./CommentThread";

const meta = { title: "Comments/CommentThread" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page }) => <CommentThread pageId={page.id} annotation={mark} open />}
      </PageFixture>
    </EditorFixture>
  ),
};
