import { PanelHeader } from "../primitives/PanelHeader";
import { PropertiesPanel } from "./PropertiesPanel";

/**
 * The Properties sidebar on the right of the reading view. Shown and hidden from the title bar;
 * Comments joins it as a tab when comments arrive.
 * @returns The inspector `<aside>`.
 */
export function Inspector() {
  return (
    <aside aria-labelledby="properties-title" className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-divider bg-rail">
      <PanelHeader id="properties-title" title="Properties" />
      <div className="overflow-y-auto p-4">
        <PropertiesPanel />
      </div>
    </aside>
  );
}
