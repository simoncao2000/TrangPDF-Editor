import { ChevronDown, FileText, PanelLeft, Plus, Save, Search, SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { useStore } from "zustand";
import { useDocument, useEditorServices } from "../../editor/hooks";
import { useDocumentActions } from "../../editor/use-document-actions";
import { useFileOpener } from "../../editor/use-file-opener";
import { useElementSize } from "../../hooks/use-element-size";
import { usePalette } from "../../state/palette-store";
import { useViewer } from "../../state/viewer-store";
import { PropertiesPanel } from "../inspector/PropertiesPanel";
import { OrganizeView } from "../organize/OrganizeView";
import { Sheet } from "../primitives/Sheet";
import { PageViewport } from "../viewer/PageViewport";
import { ToolPalette } from "./ToolPalette";

type OpenSheet = "files" | "properties" | null;

interface PhoneShellProps {
  /** False while a dialog is open, so shortcuts do not fire behind it. */
  readonly keysEnabled: boolean;
}

/**
 * The editor on a phone (and narrow windows): the open file as a switcher at the top with search
 * and save, the pages full width with the tool palette floating flat over them, and Pages, the page
 * number and Properties at the bottom. Open files and Properties open as bottom sheets.
 * @param props Whether keyboard shortcuts are on.
 * @returns The phone layout.
 */
export function PhoneShell({ keysEnabled }: PhoneShellProps) {
  const { files, workspace } = useEditorServices();
  const actions = useDocumentActions();
  const showPalette = usePalette((state) => state.show);
  const status = useDocument((state) => state.status);
  const fileName = useDocument((state) => state.fileName);
  const pageCount = useDocument((state) => state.pages.length);
  const tabCount = useStore(workspace.store, (state) => state.tabs.length);
  const { mode, setMode, currentPage } = useViewer();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(areaRef);
  const ready = status === "clean" || status === "dirty" || status === "saving";
  const save = () => void (files.canSaveInPlace ? actions.save() : actions.saveAs());

  return (
    <>
      <header className="flex min-h-13 items-center gap-0.5 border-b border-divider bg-toolbar px-2">
        <button
          type="button"
          onClick={() => setSheet("files")}
          aria-label={`${fileName ?? "No file"}, ${tabCount} open. Switch file`}
          className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-sm px-2 active:bg-hover"
        >
          <FileText className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="truncate font-hand text-lg">{fileName}</span>
          <span className="shrink-0 rounded-pill bg-pressed px-1.5 text-2xs text-muted">{tabCount}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
        <PhoneAction icon={Search} label="Search" onClick={() => showPalette()} />
        <PhoneAction
          icon={Save}
          label={files.canSaveInPlace ? "Save" : "Download"}
          disabled={files.canSaveInPlace ? status !== "dirty" : !ready}
          onClick={save}
        />
      </header>

      <div ref={areaRef} className="relative grid min-h-0 min-w-0 bg-canvas">
        {ready && mode === "organize" ? (
          <OrganizeView />
        ) : ready ? (
          <PageViewport narrow />
        ) : (
          <p className="grid place-items-center font-hand text-xl text-muted">Opening {fileName}…</p>
        )}
        {ready && <ToolPalette area={area} keysEnabled={keysEnabled} phone />}
      </div>

      <nav
        aria-label="Panels"
        className="flex min-h-14 items-center justify-around border-t border-divider bg-toolbar pb-[env(safe-area-inset-bottom)]"
      >
        <PhoneAction
          icon={PanelLeft}
          label={mode === "organize" ? "Read" : "Pages"}
          pressed={mode === "organize"}
          onClick={() => setMode(mode === "organize" ? "read" : "organize")}
          withLabel
        />
        <span className="text-sm text-muted tabular-nums">
          {pageCount > 0 ? `${currentPage + 1} / ${pageCount}` : ""}
        </span>
        <PhoneAction icon={SlidersHorizontal} label="Properties" onClick={() => setSheet("properties")} withLabel />
      </nav>

      {sheet === "files" && <FilesSheet onClose={() => setSheet(null)} />}
      {sheet === "properties" && (
        <Sheet title="Properties" onDismiss={() => setSheet(null)}>
          <div className="px-2">
            <PropertiesPanel />
          </div>
        </Sheet>
      )}
    </>
  );
}

interface PhoneActionProps {
  readonly icon: typeof Search;
  readonly label: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  /** Show the label under the icon (bottom bar). */
  readonly withLabel?: boolean;
  onClick(): void;
}

/**
 * A phone bar button with a 44 px touch target.
 * @param props Icon, label, state and click handler.
 * @returns The button.
 */
function PhoneAction({ icon: Icon, label, pressed, disabled = false, withLabel = false, onClick }: PhoneActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`grid min-h-11 min-w-11 place-items-center gap-0.5 rounded-md px-2 text-2xs disabled:text-disabled ${pressed ? "text-signal" : "text-ink"} active:bg-hover`}
    >
      <Icon className="size-5" aria-hidden="true" />
      {withLabel && <span>{label}</span>}
    </button>
  );
}

/**
 * Every open file in a sheet; tap one to switch, or open another.
 * @param props How to close the sheet.
 * @returns The sheet.
 */
function FilesSheet({ onClose }: { readonly onClose: () => void }) {
  const { workspace } = useEditorServices();
  const tabs = useStore(workspace.store, (state) => state.tabs);
  const activeId = useStore(workspace.store, (state) => state.activeId);
  const { openFromPicker } = useFileOpener();
  const row = "flex min-h-13 w-full items-center gap-3 rounded-md px-3 text-left";
  return (
    <Sheet title="Open files" onDismiss={onClose}>
      <ul className="grid gap-0.5">
        {tabs.map((tab) => {
          const { fileName, status, pages } = tab.session.store.getState();
          return (
            <li key={tab.id}>
              <button
                type="button"
                aria-current={tab.id === activeId}
                onClick={() => {
                  workspace.activate(tab.id);
                  onClose();
                }}
                className={`${row} ${tab.id === activeId ? "bg-pressed" : "active:bg-hover"}`}
              >
                <FileText className="size-4.5 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{fileName}</span>
                <span className="shrink-0 text-xs text-muted">
                  {pages.length} {pages.length === 1 ? "page" : "pages"}
                  {status === "dirty" ? " · unsaved" : ""}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => {
              onClose();
              void openFromPicker();
            }}
            className={`${row} active:bg-hover`}
          >
            <Plus className="size-4.5 shrink-0 text-muted" aria-hidden="true" />
            Open another file
          </button>
        </li>
      </ul>
    </Sheet>
  );
}
