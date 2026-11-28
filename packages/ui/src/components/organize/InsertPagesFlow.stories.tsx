import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../primitives/Button";
import { InsertPagesFlow } from "./InsertPagesFlow";
import { useInsertFlowState } from "../../editor/use-insert-pages";
import { EditorFixture } from "../../../stories/fixtures";

/** @returns A trigger and the resulting component. */
function Example() {
  const { set } = useInsertFlowState();
  return (
    <>
      <Button onClick={() => set({ name: "Appendix.pdf", pageCount: 2, insert: fn(), cancel: fn() })}>
        Open insert pages prompt
      </Button>
      <InsertPagesFlow />
    </>
  );
}

const meta = { title: "Organize/InsertPagesFlow" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @returns The interactive example. */
  render: () => (
    <EditorFixture>
      <Example />
    </EditorFixture>
  ),
};
