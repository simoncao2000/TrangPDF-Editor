import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { textObject, textStyle } from "../../../stories/sample-data";
import { FontPicker } from "./FontPicker";

const meta = { title: "Text Formatting/FontPicker" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page }) => (
          <FontPicker
            pageId={page.id}
            blockText={textObject.text}
            text={textObject.text}
            hasDraft
            wide
            style={textStyle}
            onPick={fn()}
          />
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
