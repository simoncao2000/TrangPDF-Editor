import { useDocument } from "../../editor/hooks";
import { useViewer } from "../../state/viewer-store";
import { ToolBar } from "../annotations/ToolBar";
import { Inspector } from "../inspector/Inspector";
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

/** Widths of the side columns in the wide layout. */
const RAIL_WIDTH = "clamp(176px,15vw,224px)";
const INSPECTOR_WIDTH = "clamp(248px,20vw,300px)";

/**
 * The render screen. Wide: the tool row under the document bar, thumbnails, the pages and the
 * inspector side by side, page and zoom control floating at the bottom. Narrow: pages full width
 * with a page indicator (touch tools come with the mobile layout).
 * @param props Layout variant and drag state.
 * @returns The viewer.
 */
export function ViewerScreen({ narrow, dragging }: ViewerScreenProps) {
  const status = useDocument((state) => state.status);
  const fileName = useDocument((state) => state.fileName);
  const ready = status === "clean" || status === "dirty" || status === "saving";
  const organizing = useViewer((state) => state.mode) === "organize";

  const reading = ready && !narrow && !organizing;

  return (
    <div className={`grid h-dvh bg-canvas ${narrow ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[auto_auto_minmax(0,1fr)]"}`}>
      <DocumentBar narrow={narrow} />
      {!narrow && <ToolBar keysEnabled={ready && !dragging} />}
      <div className="relative grid min-h-0" style={{ gridTemplateColumns: reading ? `${RAIL_WIDTH} minmax(0,1fr) ${INSPECTOR_WIDTH}` : "minmax(0,1fr)" }}>
        {reading && <ThumbnailRail />}
        {ready && organizing ? (
          <OrganizeView />
        ) : ready ? (
          <PageViewport narrow={narrow} />
        ) : (
          <div className="grid place-items-center text-muted" role="status">
            <p className="font-hand text-xl">Opening {fileName}…</p>
          </div>
        )}
        {reading && <Inspector />}
        {ready && !organizing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 *:pointer-events-auto" style={narrow ? undefined : { left: RAIL_WIDTH, right: INSPECTOR_WIDTH }}>
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
