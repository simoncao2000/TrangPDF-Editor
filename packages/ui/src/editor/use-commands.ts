/**
 * Every command the editor offers, defined once. The command palette lists them all; the menu bar
 * shows them grouped by `menu`. To add a command, add it here and it appears in both.
 */
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileInput,
  FileOutput,
  FolderOpen,
  Highlighter,
  LayoutGrid,
  Monitor,
  Moon,
  Move,
  MousePointer2,
  PanelLeft,
  PanelRight,
  PenLine,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  SaveAll,
  Scan,
  Search,
  Square,
  Sun,
  TextCursorInput,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { useInsertPending, useStartInsertPages } from "./use-insert-pages";
import { useAnnotationUi, type Tool } from "../state/annotation-store";
import { useLayout } from "../state/layout-store";
import { usePalette } from "../state/palette-store";
import { useTheme, type ThemePreference } from "../state/theme-store";
import { useViewer } from "../state/viewer-store";
import { useDocument, useEditorServices } from "./hooks";
import { useDocumentActions } from "./use-document-actions";
import { useFileOpener } from "./use-file-opener";

/** The menus of the menu bar, in order. */
export const MENUS = ["File", "Edit", "View", "Tools", "Pages"] as const;
export type MenuName = (typeof MENUS)[number];

/** Something the user can run from the menu bar or the command palette. */
export interface Command {
  readonly id: string;
  /** What it does, as a verb phrase ("Rotate page clockwise"). */
  readonly title: string;
  readonly menu: MenuName;
  /** Commands in a menu are split into groups by a separator. */
  readonly group: number;
  readonly icon: LucideIcon;
  /** Shown beside the title, e.g. "⌘S". */
  readonly shortcut?: string;
  /** False when it cannot run right now (no document, nothing to undo). */
  readonly enabled: boolean;
  run(): void;
}

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";

/** Tools, with their keys; markups and shapes are the variants the palette's flyouts offer. */
const TOOL_COMMANDS: readonly (readonly [Tool, string, string, LucideIcon, number])[] = [
  ["select", "Select", "V", MousePointer2, 0],
  ["editText", "Edit text", "E", TextCursorInput, 0],
  ["highlight", "Highlight", "H", Highlighter, 1],
  ["ink", "Draw", "D", PenLine, 2],
  ["square", "Rectangle", "S", Square, 2],
  ["textBox", "Add text", "T", Type, 2],
];
const THEMES: readonly (readonly [ThemePreference, string, LucideIcon])[] = [
  ["system", "Match system", Monitor],
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
];

/**
 * Every command, for the document in front.
 * @returns The commands, in menu order.
 */
export function useCommands(): readonly Command[] {
  const { files } = useEditorServices();
  const actions = useDocumentActions();
  const { openFromPicker } = useFileOpener();
  const startInsert = useStartInsertPages();
  const inserting = useInsertPending();
  const status = useDocument((state) => state.status);
  const pages = useDocument((state) => state.pages);
  const selection = useDocument((state) => state.selection);
  const undoLabel = useDocument((state) => state.undoLabel);
  const redoLabel = useDocument((state) => state.redoLabel);
  const viewer = useViewer();
  const layout = useLayout();
  const setTool = useAnnotationUi((state) => state.setTool);
  const setTheme = useTheme((state) => state.setPreference);
  const showPalette = usePalette((state) => state.show);

  const open = status === "clean" || status === "dirty";
  const page = pages[viewer.currentPage];
  /** Selected pages, or the page being read when none are selected. */
  const target = selection.length > 0 ? selection : page ? [page.id] : [];
  const pickTool = (tool: Tool) => {
    viewer.setMode("read");
    setTool(tool);
  };

  return [
    { id: "open", title: "Open…", menu: "File", group: 0, icon: FolderOpen, shortcut: `${MOD}O`, enabled: true, run: () => void openFromPicker() },
    ...(files.canSaveInPlace
      ? [
          { id: "save", title: "Save", menu: "File", group: 1, icon: Save, shortcut: `${MOD}S`, enabled: status === "dirty", run: () => void actions.save() } as const,
          { id: "save-as", title: "Save as…", menu: "File", group: 1, icon: SaveAll, shortcut: `${MOD}⇧S`, enabled: open, run: () => void actions.saveAs() } as const,
        ]
      : [{ id: "save", title: "Download", menu: "File", group: 1, icon: Download, shortcut: `${MOD}S`, enabled: open, run: () => void actions.saveAs() } as const]),
    { id: "import-pages", title: "Import pages from a file…", menu: "File", group: 2, icon: FileInput, enabled: open && !inserting, run: () => void startInsert() },
    {
      id: "export-pages",
      title: selection.length > 1 ? `Export ${selection.length} selected pages…` : selection.length === 1 ? "Export the selected page…" : "Export this page…",
      menu: "File",
      group: 2,
      icon: FileOutput,
      enabled: open && target.length > 0,
      run: () => void actions.extract(target),
    },
    { id: "close", title: "Close file", menu: "File", group: 3, icon: X, enabled: status !== "empty", run: () => actions.closeTab() },

    { id: "undo", title: undoLabel ? `Undo ${undoLabel.toLowerCase()}` : "Undo", menu: "Edit", group: 0, icon: Undo2, shortcut: `${MOD}Z`, enabled: open && undoLabel !== null, run: actions.undo },
    { id: "redo", title: redoLabel ? `Redo ${redoLabel.toLowerCase()}` : "Redo", menu: "Edit", group: 0, icon: Redo2, shortcut: `${MOD}⇧Z`, enabled: open && redoLabel !== null, run: actions.redo },
    { id: "find", title: "Find…", menu: "Edit", group: 1, icon: Search, shortcut: `${MOD}K`, enabled: true, run: () => showPalette() },

    { id: "toggle-pages", title: layout.pagesOpen ? "Hide Pages panel" : "Show Pages panel", menu: "View", group: 0, icon: PanelLeft, shortcut: `${MOD}B`, enabled: true, run: layout.togglePages },
    { id: "toggle-properties", title: layout.propertiesOpen ? "Hide Properties panel" : "Show Properties panel", menu: "View", group: 0, icon: PanelRight, enabled: true, run: layout.toggleProperties },
    { id: "zoom-in", title: "Zoom in", menu: "View", group: 1, icon: ZoomIn, enabled: open, run: () => viewer.zoomBy(1) },
    { id: "zoom-out", title: "Zoom out", menu: "View", group: 1, icon: ZoomOut, enabled: open, run: () => viewer.zoomBy(-1) },
    { id: "fit-width", title: "Fit width", menu: "View", group: 1, icon: Scan, enabled: open, run: () => viewer.setZoomMode({ kind: "fit-width" }) },
    { id: "fit-page", title: "Fit page", menu: "View", group: 1, icon: Scan, enabled: open, run: () => viewer.setZoomMode({ kind: "fit-page" }) },
    ...THEMES.map(([preference, name, icon]) => ({ id: `theme-${preference}`, title: `Theme: ${name}`, menu: "View" as const, group: 2, icon, enabled: true, run: () => setTheme(preference) })),

    ...TOOL_COMMANDS.map(([tool, name, key, icon, group]) => ({ id: `tool-${tool}`, title: name, menu: "Tools" as const, group, icon, shortcut: key, enabled: open, run: () => pickTool(tool) })),
    {
      id: "turn-tools",
      title: layout.toolOrientation === "vertical" ? "Turn tools flat" : "Turn tools upright",
      menu: "Tools",
      group: 3,
      icon: RectangleHorizontal,
      enabled: true,
      run: layout.turnTools,
    },
    { id: "reset-tools", title: "Put tools back", menu: "Tools", group: 3, icon: Move, enabled: layout.toolPosition !== null || layout.toolOrientation !== "vertical", run: layout.resetTools },

    { id: "organize", title: viewer.mode === "organize" ? "Back to reading" : "Organize pages", menu: "Pages", group: 0, icon: LayoutGrid, enabled: open, run: () => viewer.setMode(viewer.mode === "organize" ? "read" : "organize") },
    { id: "rotate-cw", title: "Rotate clockwise", menu: "Pages", group: 1, icon: RotateCw, enabled: open && target.length > 0, run: () => actions.rotate(target, 90) },
    { id: "rotate-ccw", title: "Rotate counter-clockwise", menu: "Pages", group: 1, icon: RotateCcw, enabled: open && target.length > 0, run: () => actions.rotate(target, -90) },
    { id: "next-page", title: "Next page", menu: "Pages", group: 2, icon: ChevronDown, enabled: open && viewer.currentPage < pages.length - 1, run: () => viewer.goToPage(viewer.currentPage + 1) },
    { id: "previous-page", title: "Previous page", menu: "Pages", group: 2, icon: ChevronUp, enabled: open && viewer.currentPage > 0, run: () => viewer.goToPage(viewer.currentPage - 1) },
  ];
}

