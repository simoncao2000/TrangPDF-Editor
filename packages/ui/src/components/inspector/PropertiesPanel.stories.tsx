import { PlacementFixture } from "../../../stories/PlacementFixture";
import { dragSample, seedSignatures } from "../../../stories/signature-placement";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditorFixture } from "../../../stories/fixtures";
import { PropertiesPanel } from "./PropertiesPanel";

const meta = { title: "Inspector/PropertiesPanel", component: PropertiesPanel } satisfies Meta<typeof PropertiesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  /** @param args The component props. @returns The component in the routed editor. */
  render: (args) => (
    <EditorFixture sample="text" path="/">
      <PropertiesPanel {...args} />
    </EditorFixture>
  ),
};

export const Signatures: Story = {
  beforeEach: seedSignatures,
  /** @returns The signature tiles beside a drop target. */
  render: () => (
    <PlacementFixture>
      <PropertiesPanel />
    </PlacementFixture>
  ),
};

export const Dragging: Story = { ...Signatures, play: dragSample };
