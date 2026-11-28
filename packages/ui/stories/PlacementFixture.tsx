import type { ReactNode } from "react";
import { PageViewport } from "../src/components/viewer/PageViewport";
import { EditorFixture } from "./fixtures";

/** @param props The panel under test. @returns A document beside the draggable tile. */
export function PlacementFixture({ children }: { children: ReactNode }) {
  return (
    <EditorFixture>
      <div className="grid h-96 grid-cols-[1fr_14rem] gap-3">
        <PageViewport narrow={false} />
        <aside>{children}</aside>
      </div>
    </EditorFixture>
  );
}
