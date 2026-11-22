import { useState, type ReactNode } from "react";
import { CommentsPanel } from "../comments/CommentsPanel";
import { useDocumentThreads } from "../comments/use-document-threads";
import { PropertiesPanel } from "./PropertiesPanel";

type Tab = "properties" | "comments";

/**
 * The right sidebar of the reading view, shown and hidden from the title bar: Properties (the
 * selected mark or the tool in hand) and Comments (every thread in the document), as tabs.
 * @returns The inspector `<aside>`.
 */
export function Inspector() {
  const [tab, setTab] = useState<Tab>("properties");
  const threads = useDocumentThreads();

  return (
    <aside
      aria-label="Inspector"
      className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-divider bg-rail"
    >
      {/* Same height as the tab row beside it, so the two read as one line (VS Code). */}
      <div role="tablist" aria-label="Inspector" className="flex h-9.5 items-center gap-1 border-b border-divider px-2">
        <TabButton id="properties" current={tab} onSelect={setTab}>
          Properties
        </TabButton>
        <TabButton id="comments" current={tab} onSelect={setTab}>
          Comments
          {threads.length > 0 && <span className="text-xs text-muted tabular-nums">{threads.length}</span>}
        </TabButton>
      </div>
      <div role="tabpanel" id={`inspector-${tab}`} aria-labelledby={`tab-${tab}`} className="overflow-y-auto p-3">
        {tab === "properties" ? <PropertiesPanel /> : <CommentsPanel threads={threads} />}
      </div>
    </aside>
  );
}

interface TabButtonProps {
  readonly id: Tab;
  readonly current: Tab;
  onSelect(tab: Tab): void;
  readonly children: ReactNode;
}

/**
 * One tab of the inspector.
 * @param props Which tab, which one is shown, the select callback and the label.
 * @returns The tab.
 */
function TabButton({ id, current, onSelect, children }: TabButtonProps) {
  const selected = id === current;
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`inspector-${id}`}
      onClick={() => onSelect(id)}
      className={`flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-sm transition-colors duration-(--duration-press) ${
        selected ? "bg-pressed text-ink" : "text-muted hover:bg-hover hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
