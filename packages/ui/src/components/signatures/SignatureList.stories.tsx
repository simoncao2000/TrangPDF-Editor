import { PlacementFixture } from "../../../stories/PlacementFixture";
import { dragSample, seedSignatures } from "../../../stories/signature-placement";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignatureList } from "./SignatureList";

const meta = { title: "Signatures/SignatureList", component: SignatureList } satisfies Meta<typeof SignatureList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach: seedSignatures,
  /** @returns The signature tiles beside a drop target. */
  render: () => (
    <PlacementFixture>
      <SignatureList />
    </PlacementFixture>
  ),
};

export const Dragging: Story = { ...Default, play: dragSample };
