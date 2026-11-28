import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { useViewer } from "../../state/viewer-store";
import { PhoneTools } from "../shell/PhoneTools";
import { PageViewport } from "./PageViewport";

const meta = { title: "Viewer/PageViewport", component: PageViewport } satisfies Meta<typeof PageViewport>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { narrow: false },
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <PageViewport {...args} />
    </EditorFixture>
  ),
};

export const Phone: Story = {
  args: { narrow: true },
  /** @param args The viewport props. @returns A phone viewport with live floating tools. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <div className="relative grid h-full min-h-0 max-w-sm">
        <PageViewport {...args} />
        <PhoneTools keysEnabled showTray />
      </div>
    </EditorFixture>
  ),
};

export const Zoomed: Story = {
  /** @returns Cleanup restoring the previous zoom mode. */
  beforeEach: () => {
    const { zoomMode, setZoomMode } = useViewer.getState();
    setZoomMode({ kind: "percent", zoom: 2 });
    return () => setZoomMode(zoomMode);
  },
  args: { narrow: false },
  /** @param args The viewport props. @returns A viewport opened at 200 percent. */
  render: (args) => (
    <EditorFixture sample="text" path="/?zoom=2">
      <PageViewport {...args} />
    </EditorFixture>
  ),
};
