import { Highlighter, MousePointer2, PenLine, Redo2, Square, TextCursorInput, Type, Undo2, type LucideIcon } from "lucide-react";
import { useDocument } from "../../editor/hooks";
import { useDocumentActions } from "../../editor/use-document-actions";
import { useShortcuts } from "../../hooks/use-shortcut";
import { useAnnotationUi, type Tool } from "../../state/annotation-store";
import { useViewer } from "../../state/viewer-store";
import { IconButton } from "../primitives/IconButton";

interface ToolInfo {
  readonly tool: Tool;
  readonly label: string;
  /** Single-key shortcut, lower case. */
  readonly key: string;
  readonly icon: LucideIcon;
}

const TOOLS: readonly ToolInfo[] = [
  { tool: "select", label: "Select", key: "v", icon: MousePointer2 },
  { tool: "editText", label: "Edit text", key: "e", icon: TextCursorInput },
  { tool: "highlight", label: "Highlight", key: "h", icon: Highlighter },
  { tool: "ink", label: "Draw", key: "d", icon: PenLine },
  { tool: "square", label: "Shape", key: "s", icon: Square },
  { tool: "textBox", label: "Add text", key: "t", icon: Type },
];

interface ToolBarProps {
  /** False while a dialog is open, so single-key shortcuts do not fire behind it. */
  readonly keysEnabled: boolean;
}

/**
 * The tool row under the document bar (wide layout): Undo and Redo, then the tools. The tool in
 * hand shows its name. V, E, H, D, S and T pick tools; Escape goes back to Select.
 * Picking a tool while organizing pages goes back to reading.
 * @param props Whether keyboard shortcuts are on.
 * @returns The tools `<nav>`.
 */
export function ToolBar({ keysEnabled }: ToolBarProps) {
  const actions = useDocumentActions();
  const status = useDocument((state) => state.status);
  const undoLabel = useDocument((state) => state.undoLabel);
  const redoLabel = useDocument((state) => state.redoLabel);
  const tool = useAnnotationUi((state) => state.tool);
  const setTool = useAnnotationUi((state) => state.setTool);
  const setMode = useViewer((state) => state.setMode);
  const editable = status === "clean" || status === "dirty";

  const pick = (next: Tool) => {
    setMode("read");
    setTool(next);
  };

  useShortcuts(
    [...TOOLS.map(({ tool: next, key }) => [{ key }, () => pick(next)] as const), [{ key: "escape" }, () => setTool("select")] as const],
    keysEnabled && editable,
  );

  return (
    <nav aria-label="Tools" className="flex min-h-12 items-center gap-1 border-b border-divider bg-toolbar px-3">
      <IconButton icon={Undo2} label={undoLabel ? `Undo ${undoLabel.toLowerCase()}` : "Undo"} disabled={!editable || !undoLabel} onClick={actions.undo} />
      <IconButton icon={Redo2} label={redoLabel ? `Redo ${redoLabel.toLowerCase()}` : "Redo"} disabled={!editable || !redoLabel} onClick={actions.redo} />
      <span className="mx-1.5 h-6 w-px bg-divider" aria-hidden="true" />
      <div role="group" aria-label="Annotation tools" className="flex items-center gap-0.5">
        {TOOLS.map(({ tool: option, label, key, icon: Icon }) => {
          const active = option === tool;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              aria-label={label}
              title={`${label} (${key.toUpperCase()})`}
              disabled={!editable}
              onClick={() => pick(option)}
              className={`inline-flex h-(--control-target) min-w-(--control-target) shrink-0 items-center justify-center gap-1.5 rounded-sm px-2.5 text-sm font-semibold transition-[background-color,color,transform] duration-(--duration-press) ease-out active:scale-[0.94] disabled:cursor-default disabled:text-disabled ${
                active ? "bg-selection text-on-selection" : "text-ink hover:bg-hover"
              }`}
            >
              <Icon className="size-4.5" aria-hidden="true" />
              {active && option !== "select" && <span>{label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
