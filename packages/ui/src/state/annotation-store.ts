/**
 * Annotation view state: the tool in hand, each tool's style, and which annotation is selected.
 * Not document state: none of it changes the file or is undone.
 */
import type { Rgb } from "@pdf-editor/core";
import { create } from "zustand";

export type Tool =
  | "select"
  | "editText"
  | "note"
  | "highlight"
  | "underline"
  | "strikeout"
  | "squiggly"
  | "ink"
  | "square"
  | "circle"
  | "line"
  | "arrow"
  | "textBox"
  | "image"
  | "sign";
/** The tools that make annotations. */
export type DrawingTool = Exclude<Tool, "select" | "editText">;

/**
 * Whether a tool makes annotations (and so has a style).
 * @param tool A tool.
 * @returns True for every tool but Select and Edit text.
 */
export function isDrawingTool(tool: Tool): tool is DrawingTool {
  return tool !== "select" && tool !== "editText";
}

export interface ToolStyle {
  readonly color: Rgb;
  /** 0 to 1. */
  readonly opacity: number;
  /** Stroke width in points (drawings and rectangles). */
  readonly lineWidth: number;
  /** Font size in points (text boxes). */
  readonly fontSize: number;
}

/** The five annotation colours from the design. Fixed RGB: they are written into the PDF. */
export const SWATCHES: readonly { readonly name: string; readonly color: Rgb }[] = [
  { name: "Butter", color: { r: 244, g: 217, b: 126 } },
  { name: "Mint", color: { r: 168, g: 220, b: 196 } },
  { name: "Sky", color: { r: 166, g: 210, b: 239 } },
  { name: "Lilac", color: { r: 173, g: 139, b: 196 } },
  { name: "Ink", color: { r: 41, g: 77, b: 119 } },
];

const [BUTTER, MINT, SKY, LILAC, INK] = SWATCHES.map((swatch) => swatch.color) as [Rgb, Rgb, Rgb, Rgb, Rgb];

export const DEFAULT_STYLES: Readonly<Record<DrawingTool, ToolStyle>> = {
  note: { color: BUTTER, opacity: 1, lineWidth: 1, fontSize: 14 },
  highlight: { color: BUTTER, opacity: 0.7, lineWidth: 1, fontSize: 14 },
  underline: { color: SKY, opacity: 1, lineWidth: 1, fontSize: 14 },
  strikeout: { color: LILAC, opacity: 1, lineWidth: 1, fontSize: 14 },
  squiggly: { color: MINT, opacity: 1, lineWidth: 1, fontSize: 14 },
  ink: { color: INK, opacity: 1, lineWidth: 2, fontSize: 14 },
  square: { color: LILAC, opacity: 1, lineWidth: 2, fontSize: 14 },
  circle: { color: LILAC, opacity: 1, lineWidth: 2, fontSize: 14 },
  line: { color: INK, opacity: 1, lineWidth: 2, fontSize: 14 },
  arrow: { color: INK, opacity: 1, lineWidth: 2, fontSize: 14 },
  sign: { color: INK, opacity: 1, lineWidth: 1.5, fontSize: 14 },
  image: { color: INK, opacity: 1, lineWidth: 1, fontSize: 14 },
  textBox: { color: INK, opacity: 1, lineWidth: 1, fontSize: 14 },
};

export interface SelectedAnnotation {
  readonly pageId: string;
  readonly id: string;
}

/** Tools that share one palette button, which shows the one used last. */
export const MARKUP_TOOLS = ["highlight", "underline", "strikeout", "squiggly"] as const;
export const SHAPE_TOOLS = ["square", "circle", "line", "arrow"] as const;
export type MarkupTool = (typeof MARKUP_TOOLS)[number];
export type ShapeTool = (typeof SHAPE_TOOLS)[number];

export interface AnnotationUiState {
  readonly tool: Tool;
  readonly styles: Readonly<Record<DrawingTool, ToolStyle>>;
  readonly selected: SelectedAnnotation | null;
  /** The markup and shape the palette's Markup and Shapes buttons pick. */
  readonly lastMarkup: MarkupTool;
  readonly lastShape: ShapeTool;
  /** The selected mark's comment box takes the cursor (a new note, Comment on selected text). */
  readonly writing: boolean;
  setTool(tool: Tool): void;
  setStyle(tool: DrawingTool, patch: Partial<ToolStyle>): void;
  select(selected: SelectedAnnotation | null): void;
  /**
   * Selects a mark and puts the cursor in its comment box.
   * @param selected The mark.
   */
  selectToComment(selected: SelectedAnnotation): void;
}

const isMarkupTool = (tool: Tool): tool is MarkupTool => (MARKUP_TOOLS as readonly Tool[]).includes(tool);
const isShapeTool = (tool: Tool): tool is ShapeTool => (SHAPE_TOOLS as readonly Tool[]).includes(tool);

export const useAnnotationUi = create<AnnotationUiState>((set) => ({
  tool: "select",
  styles: DEFAULT_STYLES,
  selected: null,
  lastMarkup: "highlight",
  lastShape: "square",
  writing: false,
  // Picking a tool lets go of the selection, so the Properties panel shows the tool.
  setTool: (tool) =>
    set({
      tool,
      selected: null,
      writing: false,
      ...(isMarkupTool(tool) ? { lastMarkup: tool } : {}),
      ...(isShapeTool(tool) ? { lastShape: tool } : {}),
    }),
  setStyle: (tool, patch) =>
    set((state) => ({ styles: { ...state.styles, [tool]: { ...state.styles[tool], ...patch } } })),
  select: (selected) => set({ selected, writing: false }),
  selectToComment: (selected) => set({ selected, writing: true }),
}));
