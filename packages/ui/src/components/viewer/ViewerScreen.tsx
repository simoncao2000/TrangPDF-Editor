import { useDocument } from "../../editor/hooks";
import { useViewer } from "../../state/viewer-store";
import { OrganizeView } from "../organize/OrganizeView";
import { DocumentBar } from "./DocumentBar";
import { PageControl, PageIndicator } from "./PageControl";
import { PageViewport } from "./PageViewport";
import { ThumbnailRail } from "./ThumbnailRail";

interface ViewerScreenProps {
  readonly narrow: boolean;
  /** True while a file is dragged over the window. */
  readonly dragging: boolean;
}

/**
 * The render screen. Wide: thumbnails beside the pages, page and
 * zoom control floating at the bottom. Narrow: pages full width with a page indicator.
 * Tools and the inspector arrive with Phases 2 and 3.
 * @param props Layout variant and drag state.
 * @returns The viewer.
 */
export function ViewerScreen({ narrow, dragging }: ViewerScreenProps) {
  const status = useDocument((state) => state.status);
  const fileName = useDocument((state) => state.fileName);
  const ready = status === "clean" || status === "dirty" || status === "saving";
  const organizing = useViewer((state) => state.mode) === "organize";

  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] bg-canvas">
      <DocumentBar narrow={narrow} />
      <div className={`relative grid min-h-0 ${narrow || !ready || organizing ? "grid-cols-1" : "grid-cols-[clamp(176px,15vw,224px)_minmax(0,1fr)]"}`}>
        {ready && !narrow && !organizing && <ThumbnailRail />}
        {ready && organizing ? (
          <OrganizeView />
        ) : ready ? (
          <PageViewport narrow={narrow} />
        ) : (
          <div className="grid place-items-center text-muted" role="status">
            <p className="font-hand text-xl">Opening {fileName}…</p>
          </div>
        )}
        {ready && !organizing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 *:pointer-events-auto" style={narrow ? undefined : { left: "clamp(176px,15vw,224px)" }}>
            {narrow ? <PageIndicator /> : <PageControl />}
          </div>
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-sm border-2 border-dashed border-signal bg-signal-soft/80">
            <p className="font-hand text-2xl text-ink">Drop to open this PDF instead</p>
          </div>
        )}
      </div>
    </div>
  );
}
