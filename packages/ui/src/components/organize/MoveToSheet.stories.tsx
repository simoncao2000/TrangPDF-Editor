import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { MoveToSheet } from "./MoveToSheet";

const meta = { title: "Organize/MoveToSheet" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page, pages }) => <MoveToSheet id={page.id} pages={pages} onDismiss={fn()} onMove={fn()} />}
      </PageFixture>
    </EditorFixture>
  ),
};
