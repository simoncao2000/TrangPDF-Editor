import { useRef } from "react";
import { useDocument } from "../../editor/hooks";
import { useElementSize } from "../../hooks/use-element-size";
import { useMediaQuery } from "../../hooks/use-media-query";
import { useLayout } from "../../state/layout-store";
import { useViewer } from "../../state/viewer-store";
import { Inspector } from "../inspector/Inspector";
import { OrganizeView } from "../organize/OrganizeView";
import { PageControl } from "../viewer/PageControl";
import { PageViewport } from "../viewer/PageViewport";
import { ThumbnailRail } from "../viewer/ThumbnailRail";
import { TabRow } from "./TabRow";
import { ToolPalette } from "./ToolPalette";

/** Widths of the sidebars. */
const PAGES_WIDTH = "clamp(176px,15vw,224px)";
const PROPERTIES_WIDTH = "clamp(248px,20vw,300px)";
/** Below this width Properties folds away first, so the page keeps its room. */
const PROPERTIES_ROOM_QUERY = "(min-width: 1200px)";

interface WorkbenchProps {
  /** False while a dialog is open, so shortcuts do not fire behind it. */
  readonly keysEnabled: boolean;
}

/**
 * The body of the editor (desktop and tablet), VS Code style: the Pages and Properties sidebars
 * run full height, and the document column between them has the file tabs on top and the pages
 * below, with the tool palette floating over them.
 * @param props Whether keyboard shortcuts are on.
 * @returns The workbench.
 */
export function Workbench({ keysEnabled }: WorkbenchProps) {
  const status = useDocument((state) => state.status);
  const fileName = useDocument((state) => state.fileName);
  const organizing = useViewer((state) => state.mode) === "organize";
  const { pagesOpen, propertiesOpen } = useLayout();
  const roomForProperties = useMediaQuery(PROPERTIES_ROOM_QUERY);
  const areaRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(areaRef);
  const ready = status === "clean" || status === "dirty" || status === "saving";
  const reading = ready && !organizing;
  const showPages = reading && pagesOpen;
  const showProperties = reading && propertiesOpen && roomForProperties;

  return (
    <div
      className="grid min-h-0"
      style={{
        gridTemplateColumns: [showPages ? PAGES_WIDTH : null, "minmax(0,1fr)", showProperties ? PROPERTIES_WIDTH : null]
          .filter(Boolean)
          .join(" "),
      }}
    >
      {showPages && <ThumbnailRail />}
      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
        <TabRow />
        <div ref={areaRef} className="relative grid min-h-0 min-w-0 bg-canvas">
          {ready && organizing ? (
            <OrganizeView />
          ) : ready ? (
            <>
              <PageViewport narrow={false} />
              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center *:pointer-events-auto">
                <PageControl />
              </div>
            </>
          ) : (
            <div className="grid place-items-center text-muted" role="status">
              <p className="font-hand text-xl">{status === "loading" ? `Opening ${fileName}…` : ""}</p>
            </div>
          )}
          {ready && <ToolPalette area={area} keysEnabled={keysEnabled} />}
        </div>
      </div>
      {showProperties && <Inspector />}
    </div>
  );
}
