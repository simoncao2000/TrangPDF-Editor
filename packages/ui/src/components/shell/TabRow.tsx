import type { Tab } from "@pdf-editor/core";
import { ChevronDown, FileText, Plus, X } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { useStore } from "zustand";
import { useEditorServices } from "../../editor/hooks";
import { useDocumentActions } from "../../editor/use-document-actions";
import { useFileOpener } from "../../editor/use-file-opener";
import { DropdownMenu } from "../primitives/DropdownMenu";

/**
 * The open files above the document (VS Code: the tab row belongs to the document column, the
 * sidebars run full height beside it). Tabs scroll sideways; "All files" lists every open file,
 * so any number of files stays reachable. Arrow keys move between tabs; middle-click closes one.
 * @returns The tab row.
 */
export function TabRow() {
  const { workspace } = useEditorServices();
  const tabs = useStore(workspace.store, (state) => state.tabs);
  const activeId = useStore(workspace.store, (state) => state.activeId);
  const { openFromPicker } = useFileOpener();
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const index = tabs.findIndex((tab) => tab.id === activeId);
    if (!step || index === -1) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length]!;
    workspace.activate(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  };

  return (
    <div className="flex min-h-9.5 min-w-0 items-center gap-1 border-b border-divider bg-canvas px-2">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Open files"
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] [scrollbar-width:none]"
      >
        {tabs.map((tab) => (
          <TabItem key={tab.id} tab={tab} active={tab.id === activeId} />
        ))}
        <button
          type="button"
          aria-label="Open another file"
          title="Open another file"
          onClick={() => void openFromPicker()}
          className="grid size-7.5 shrink-0 place-items-center rounded-sm text-muted hover:bg-hover hover:text-ink"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
      <DropdownMenu
        label="All open files"
        triggerLabel={`All ${tabs.length} open files`}
        triggerClassName="h-7 shrink-0 px-2 text-xs text-muted"
        widthClassName="w-64"
        renderTrigger={() => (
          <>
            All files · {tabs.length}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </>
        )}
        entries={tabs.map((tab) => ({
          value: tab.id,
          label: tab.session.store.getState().fileName ?? "Untitled",
          icon: FileText,
        }))}
        value={activeId}
        onSelect={(id) => workspace.activate(id)}
      />
    </div>
  );
}

interface TabItemProps {
  readonly tab: Tab;
  readonly active: boolean;
}

/**
 * One open file: a soft tab, raised when it is in front. A dot marks unsaved changes and turns
 * into a close button on hover.
 * @param props The tab and whether it is in front.
 * @returns The tab.
 */
function TabItem({ tab, active }: TabItemProps) {
  const { workspace } = useEditorServices();
  const actions = useDocumentActions();
  const fileName = useStore(tab.session.store, (state) => state.fileName) ?? "Untitled";
  const status = useStore(tab.session.store, (state) => state.status);
  const dirty = status === "dirty" || status === "saving";

  return (
    <div
      className={`group flex h-7.5 max-w-52 shrink-0 items-center gap-1.5 rounded-sm pr-1 pl-2.5 text-sm transition-colors ${
        active ? "bg-raised text-ink shadow-1 ring-1 ring-line/40" : "text-muted hover:bg-hover hover:text-ink"
      }`}
      onAuxClick={(event) => event.button === 1 && actions.closeTab(tab.id)}
    >
      <button
        type="button"
        role="tab"
        data-tab={tab.id}
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        title={dirty ? `${fileName} (unsaved changes)` : fileName}
        onClick={() => workspace.activate(tab.id)}
        className="flex min-w-0 items-center gap-1.5 outline-none focus-visible:underline"
      >
        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{fileName}</span>
      </button>
      <button
        type="button"
        aria-label={`Close ${fileName}`}
        title="Close"
        onClick={() => actions.closeTab(tab.id)}
        className={`grid size-5 shrink-0 place-items-center rounded-xs hover:bg-pressed ${active || dirty ? "" : "invisible group-focus-within:visible group-hover:visible"}`}
      >
        {dirty ? (
          <>
            <span className="size-1.75 rounded-full bg-current group-hover:hidden" aria-hidden="true" />
            <X className="hidden size-3.5 group-hover:block" aria-hidden="true" />
          </>
        ) : (
          <X className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
