import { LayoutGrid, ListChecks, MessageSquare, Search, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useOpenPanel, useViewMode } from "../../../routing/hooks";
import { useShowPalette } from "../../../state/palette-store";

interface PanelTabsProps {
  readonly threadCount: number;
  readonly progress: { readonly done: number; readonly total: number };
}

/**
 * Shows the phone's page and panel controls.
 * @param props Thread count and field completion.
 * @returns The bottom navigation.
 */
export function PanelTabs({ threadCount, progress }: PanelTabsProps) {
  const { panel, openPanel } = useOpenPanel();
  const { mode, setMode } = useViewMode();
  const showPalette = useShowPalette();

  return (
    <nav
      aria-label="Panels"
      className="relative z-7 grid auto-cols-fr grid-flow-col border-t border-divider bg-toolbar px-1 pt-0.5 pb-[max(4px,env(safe-area-inset-bottom))]"
    >
      <PanelTab
        icon={LayoutGrid}
        label="Pages"
        pressed={mode === "organize"}
        onClick={() => setMode(mode === "organize" ? "read" : "organize")}
      />
      <PanelTab icon={Search} label="Search" pressed={panel === "search"} onClick={() => showPalette()} />
      <PanelTab
        icon={MessageSquare}
        label="Comments"
        badge={threadCount || undefined}
        pressed={panel === "comments"}
        onClick={() => openPanel("comments")}
      />
      {progress.total > 0 && (
        <PanelTab
          icon={ListChecks}
          label="Fields"
          badge={`${progress.done}/${progress.total}`}
          pressed={panel === "fields"}
          onClick={() => openPanel("fields")}
        />
      )}
      <PanelTab
        icon={SlidersHorizontal}
        label="Properties"
        pressed={panel === "properties"}
        onClick={() => openPanel("properties")}
      />
    </nav>
  );
}

interface PanelTabProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly pressed: boolean;
  readonly badge?: string | number;
  onClick(): void;
}

/**
 * Shows an icon, label and optional count on a phone tab.
 * @param props The tab's content and action.
 * @returns The tab button.
 */
function PanelTab({ icon: Icon, label, pressed, badge, onClick }: PanelTabProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="relative grid min-h-12.5 min-w-11 content-center justify-items-center gap-[3px] rounded-md text-2xs leading-none font-medium text-muted aria-pressed:text-signal motion-safe:active:scale-95"
    >
      <Icon className="size-5" aria-hidden="true" />
      <span>{label}</span>
      {badge !== undefined && (
        <span className="absolute top-0.5 left-[calc(50%+7px)] min-w-4.5 rounded-pill bg-pressed px-[5px] py-0.5 text-center text-[0.625rem] leading-[1.2] font-semibold text-ink tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}
