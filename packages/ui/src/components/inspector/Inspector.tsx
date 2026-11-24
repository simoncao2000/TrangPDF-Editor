import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useEditorServices } from "../../editor/hooks";
import { useExport, type BlockedExport } from "../../editor/use-export";
import { CommentsPanel } from "../comments/CommentsPanel";
import { useDocumentThreads } from "../comments/use-document-threads";
import { FieldsPanel } from "../forms/FieldsPanel";
import { useDocumentFields } from "../forms/use-document-fields";
import { PropertiesPanel } from "./PropertiesPanel";

type Tab = "properties" | "comments" | "fields";

/**
 * The right sidebar of the reading view, with Properties, Comments and document form fields.
 * @returns The inspector sidebar.
 */
export function Inspector() {
  const { session } = useEditorServices();
  const [tab, setTab] = useState<Tab>("properties");
  const [viewedReview, setViewedReview] = useState<BlockedExport>();
  const request = useExport((state) => state.request);
  const review = request?.stage === "blocked" && request.session === session ? request : undefined;
  const fields = useDocumentFields();
  const items = fields.length || !review ? fields : [review.first];
  const hasFields = items.length > 0;
  const selected = review && review !== viewedReview ? "fields" : tab;
  const current = selected === "fields" && !hasFields ? "properties" : selected;
  const { threads, count } = useDocumentThreads(current === "comments");

  /** @param next The tab the user explicitly chose. */
  const select = (next: Tab) => {
    setViewedReview(review);
    setTab(next);
  };

  return (
    <aside
      aria-label="Inspector"
      className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-divider bg-rail"
    >
      <InspectorTabs current={current} onSelect={select} threads={count} hasFields={hasFields} />
      <div
        role="tabpanel"
        id={`inspector-${current}`}
        aria-labelledby={`tab-${current}`}
        tabIndex={0}
        className={`overflow-y-auto ${current === "fields" ? "px-(--space-4) pt-(--space-4) pb-(--space-6)" : "p-3"}`}
      >
        {current === "properties" && <PropertiesPanel />}
        {current === "comments" && <CommentsPanel threads={threads} />}
        {current === "fields" && <FieldsPanel fields={items} validate={!!review} />}
      </div>
    </aside>
  );
}

interface InspectorTabsProps {
  readonly current: Tab;
  readonly onSelect: (tab: Tab) => void;
  readonly threads: number;
  readonly hasFields: boolean;
}

/**
 * @param props The active tab, available panels and selection handler.
 * @returns The keyboard-navigable Inspector tab list.
 */
function InspectorTabs({ current, onSelect, threads, hasFields }: InspectorTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Inspector"
      onKeyDown={moveTabFocus}
      className="flex h-9.5 items-center gap-1 border-b border-divider px-2"
    >
      <TabButton id="properties" current={current} onSelect={onSelect}>
        Properties
      </TabButton>
      <TabButton id="comments" current={current} onSelect={onSelect}>
        Comments
        {threads > 0 && <span className="text-xs text-muted tabular-nums">{threads}</span>}
      </TabButton>
      {hasFields && (
        <TabButton id="fields" current={current} onSelect={onSelect}>
          Fields
        </TabButton>
      )}
    </div>
  );
}

interface TabButtonProps {
  readonly id: Tab;
  readonly current: Tab;
  readonly onSelect: (tab: Tab) => void;
  readonly children: ReactNode;
}

/**
 * @param props The tab's name, selection state, label and callback.
 * @returns One tab of the Inspector.
 */
function TabButton({ id, current, onSelect, children }: TabButtonProps) {
  const selected = id === current;
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={selected ? `inspector-${id}` : undefined}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(id)}
      className={`relative flex h-full items-center gap-1.5 px-(--space-2) text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none ${selected ? "font-semibold text-ink after:absolute after:inset-x-(--space-2) after:-bottom-px after:h-0.5 after:rounded-t-xs after:bg-signal" : "font-medium text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

/**
 * Moves focus and activates the next tab with arrows, Home or End.
 * @param event A key press within the tab list.
 */
function moveTabFocus(event: KeyboardEvent<HTMLDivElement>) {
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const current = tabs.findIndex((tab) => tab === event.target);
  if (current < 0) return;
  const targets: Record<string, number | undefined> = {
    ArrowLeft: (current + tabs.length - 1) % tabs.length,
    ArrowRight: (current + 1) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  };
  if (!Object.hasOwn(targets, event.key)) return;
  const next = tabs[targets[event.key]!];
  event.preventDefault();
  next?.focus();
  next?.click();
}
