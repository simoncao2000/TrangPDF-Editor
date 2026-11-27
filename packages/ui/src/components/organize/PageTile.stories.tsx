import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { PageTile } from "./PageTile";

const meta = { title: "Organize/PageTile" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page }) => (
          <PageTile
            page={page}
            number={1}
            selected
            narrow={false}
            held={false}
            dimmed={false}
            carried={false}
            onMenu={fn()}
            onSelect={fn()}
            onOpen={fn()}
          />
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
