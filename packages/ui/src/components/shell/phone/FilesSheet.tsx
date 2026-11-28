import { FileText, Plus } from "lucide-react";
import { useStore } from "zustand";
import { useEditorServices } from "../../../editor/hooks";
import { useFileOpener } from "../../../editor/use-file-opener";
import { Sheet } from "../../primitives/Sheet";

/**
 * Every open file in a sheet; tap one to switch, or open another.
 * @param props How to close the sheet.
 * @returns The sheet.
 */
export function FilesSheet({ onClose }: { readonly onClose: (after?: () => void) => void }) {
  const { workspace } = useEditorServices();
  const tabs = useStore(workspace.store, (state) => state.tabs);
  const activeId = useStore(workspace.store, (state) => state.activeId);
  const { openFromPicker } = useFileOpener();
  const row = "flex min-h-13 w-full items-center gap-3 rounded-md px-3 text-left";
  return (
    <Sheet title={`Open files · ${tabs.length}`} onDismiss={onClose}>
      <ul className="grid gap-0.5">
        {tabs.map((tab) => {
          const { fileName, status, pages } = tab.session.store.getState();
          return (
            <li key={tab.id}>
              <button
                type="button"
                aria-current={tab.id === activeId}
                onClick={() => {
                  onClose(() => workspace.activate(tab.id));
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
