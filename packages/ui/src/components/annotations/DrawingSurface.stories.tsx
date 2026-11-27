import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditorFixture, PageFixture } from "../../../stories/fixtures";
import { useSignatures } from "../../state/signature-store";
import { signature, toolStyle } from "../../../stories/sample-data";
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

export const SignatureCursor: Story = {
  /** @returns Cleanup restoring the previous signature selection. */
  beforeEach: () => {
    const previous = useSignatures.getState().temporary;
    useSignatures.getState().setTemporary(signature);
    return () => useSignatures.setState({ temporary: previous });
  },
  /** @returns The live signature cursor on its pointer surface. */
  render: () => (
    <EditorFixture sample="text">
      <PageFixture>
        {({ page, frame, width, height }) => (
          <svg width={width} height={height}>
            <DrawingSurface
              pageId={page.id}
              tool="sign"
              style={toolStyle}
              frame={frame}
              width={width}
              height={height}
              onCreate={fn()}
              onTextAt={fn()}
            />
          </svg>
        )}
      </PageFixture>
    </EditorFixture>
  ),
};
