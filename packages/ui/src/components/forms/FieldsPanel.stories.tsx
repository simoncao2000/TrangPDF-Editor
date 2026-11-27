import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { field } from "../../../stories/sample-data";
import { FieldsPanel } from "./FieldsPanel";

const meta = { title: "Forms/FieldsPanel" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The component on a sample PDF page. */
  render: () => (
    <EditorFixture sample="form">
      <PageFixture>
        {/** @param page The sample page geometry. @returns The component on the page. */}
        {({ page }) => (
          <FieldsPanel
            fields={[
              { pageId: page.id, name: field.name, kind: field.kind, required: true, filled: false, first: field },
            ]}
            validate
            onOpenField={fn()}
          />
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
