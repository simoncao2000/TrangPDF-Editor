import { PropertiesPanel } from "./PropertiesPanel";

/**
 * The side panel on the right of the reading view (wide layout). Properties for now; Comments,
 * Search and Fields join it as those features arrive.
 * @returns The inspector `<aside>`.
 */
export function Inspector() {
  return (
    <aside aria-labelledby="inspector-title" className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-divider bg-surface">
      <h2 id="inspector-title" className="border-b border-divider px-4 py-3 text-sm font-semibold">
        Properties
      </h2>
      <div className="overflow-y-auto p-4">
        <PropertiesPanel />
      </div>
    </aside>
  );
}
