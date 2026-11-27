import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { box } from "../../../stories/sample-data";
import { TextBoxEditor } from "./TextBoxEditor";

const meta = { title: "Annotations/TextBoxEditor" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ frame }) => <TextBoxEditor annotation={box} frame={frame} onDone={fn()} />}
      </PageFixture>
    </EditorFixture>
  ),
};
