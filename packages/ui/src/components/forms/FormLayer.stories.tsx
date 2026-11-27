import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { FormLayer } from "./FormLayer";

const meta = { title: "Forms/FormLayer" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="form">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page, zoom, width, height }) => <FormLayer page={page} zoom={zoom} width={width} height={height} />}
      </PageFixture>
    </EditorFixture>
  ),
};
