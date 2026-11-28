/**
 * Every tool once: its name, its key and its icon, and how the palette lays them out. The tool
 * palette and the Tools menu both read this, so a new tool is added here only.
 */
import {
  Circle,
  Highlighter,
  ImagePlus,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Signature,
  Spline,
  Square,
  Strikethrough,
  TextCursorInput,
  Type,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { MARKUP_TOOLS, SHAPE_TOOLS, type Tool } from "../state/annotation-store";

export interface ToolInfo {
  readonly tool: Tool;
  readonly label: string;
  /** Single-key shortcut, lower case; none for tools picked only from their group. */
  readonly key?: string;
  readonly icon: LucideIcon;
}

export const TOOL_INFO: Readonly<Record<Tool, ToolInfo>> = {
  select: { tool: "select", label: "Select", key: "v", icon: MousePointer2 },
  editText: { tool: "editText", label: "Edit text", key: "e", icon: TextCursorInput },
  note: { tool: "note", label: "Note", key: "n", icon: MessageSquarePlus },
  highlight: { tool: "highlight", label: "Highlight", key: "h", icon: Highlighter },
  underline: { tool: "underline", label: "Underline", key: "u", icon: Underline },
  strikeout: { tool: "strikeout", label: "Strikethrough", key: "k", icon: Strikethrough },
  squiggly: { tool: "squiggly", label: "Squiggly", icon: Spline },
  ink: { tool: "ink", label: "Draw", key: "d", icon: PenLine },
  square: { tool: "square", label: "Rectangle", key: "r", icon: Square },
  circle: { tool: "circle", label: "Ellipse", key: "o", icon: Circle },
  line: { tool: "line", label: "Line", key: "l", icon: Minus },
  arrow: { tool: "arrow", label: "Arrow", key: "a", icon: MoveUpRight },
  textBox: { tool: "textBox", label: "Add text", key: "t", icon: Type },
  image: { tool: "image", label: "Image", key: "i", icon: ImagePlus },
  sign: { tool: "sign", label: "Sign", key: "g", icon: Signature },
};

/** A palette slot: one tool, or a group shown as its last-used tool with the others in a menu. */
export type PaletteSlot =
  | { readonly kind: "tool"; readonly tool: Tool }
  | { readonly kind: "group"; readonly name: "Markup" | "Shapes"; readonly tools: readonly Tool[] };

export const PALETTE: readonly PaletteSlot[] = [
  { kind: "tool", tool: "select" },
  { kind: "tool", tool: "editText" },
  { kind: "tool", tool: "note" },
  { kind: "group", name: "Markup", tools: MARKUP_TOOLS },
  { kind: "tool", tool: "ink" },
  { kind: "group", name: "Shapes", tools: SHAPE_TOOLS },
  { kind: "tool", tool: "textBox" },
  { kind: "tool", tool: "image" },
  { kind: "tool", tool: "sign" },
];

/** Every tool, in palette order (groups opened). */
export const ALL_TOOLS: readonly ToolInfo[] = PALETTE.flatMap((slot) =>
  slot.kind === "tool" ? [TOOL_INFO[slot.tool]] : slot.tools.map((tool) => TOOL_INFO[tool]),
);
