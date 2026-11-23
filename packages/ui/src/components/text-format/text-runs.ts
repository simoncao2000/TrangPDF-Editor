import {
  missingFontCharacter,
  normalizeTextRuns,
  type Rgb,
  type TextRun,
  type TextRunFamily,
  type TextRunLines,
} from "@pdf-editor/core";
import {
  $caretRangeFromSelection,
  $getRoot,
  $getTextPointCaretSliceForNode,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  $splitTextPointCaretSlice,
  getStyleObjectFromCSS,
  type EditorState,
  type RangeSelection,
} from "lexical";

import { bundledFontBytes, chosenFont, embeddedRunFont } from "./font-model";

export const FAMILIES: Record<TextRunFamily, { name: string; css: string }> = {
  Helvetica: { name: "Sans", css: "Helvetica, Arial, sans-serif" },
  Times: { name: "Serif", css: "Times, 'Times New Roman', serif" },
  Courier: { name: "Mono", css: "Courier, 'Courier New', monospace" },
};

export type RunStyle = Omit<TextRun, "text" | "font" | "fontFamily"> & {
  readonly fontFamily: TextRunFamily;
  readonly fontChoice?: string;
  readonly fontFallback?: string;
};

/**
 * Resolves the CSS face for the draft and toolbar.
 * @param style The current family fields.
 * @returns The display name and CSS family, if uniform.
 */
export function displayFont(style: { fontChoice?: string | null; fontFamily: TextRunFamily | null }) {
  return chosenFont(style.fontChoice) ?? (style.fontFamily ? FAMILIES[style.fontFamily] : null);
}

/**
 * Converts an RGB value to a CSS hex colour.
 * @param color The RGB channels.
 * @returns A six-digit hex colour.
 */
export function colorHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("");
}

/**
 * Parses a six-digit hex colour.
 * @param value The field or style value.
 * @returns RGB channels or null.
 */
export function parseHex(value: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const packed = Number.parseInt(match[1]!, 16);
  return { r: packed >> 16, g: (packed >> 8) & 255, b: packed & 255 };
}

/**
 * Resolves a node or typing style to PDF run attributes.
 * @param css The Lexical CSS style.
 * @param formats The node or range providing built-in formats.
 * @param defaults The draft's base style.
 * @returns A run style in PDF points.
 */
export function readRunStyle(css: string, formats: Pick<RangeSelection, "hasFormat">, defaults: RunStyle): RunStyle {
  const style = getStyleObjectFromCSS(css);
  const [name, fallback] = style["font-family"]?.split(",").map((value) => value.trim()) ?? [];
  const family = name === "Times" || name === "Courier" || name === "Helvetica" ? name : defaults.fontFamily;
  // A CSS custom property scales the authored point size with the page.
  const size = Number(/var\(--pdf-text-scale\) \* ([\d.]+)\)/.exec(style["font-size"] ?? "")?.[1]);
  return {
    fontFamily: family,
    ...(name?.startsWith("pdf-face-") && { fontChoice: name.slice(9) }),
    ...(fallback?.startsWith("pdf-face-") && { fontFallback: fallback.slice(9) }),
    fontSize: Number.isFinite(size) ? size : defaults.fontSize,
    color: parseHex(style.color ?? "") ?? defaults.color,
    bold: formats.hasFormat("bold"),
    italic: formats.hasFormat("italic"),
    underline: formats.hasFormat("underline"),
  };
}

/**
 * Uses the configured document fallback for characters absent from a bundled face.
 * @param style The node's format and face choices.
 * @param text The node's text.
 * @returns Consecutive spans using the effective font for each character.
 */
function runsForText(style: RunStyle, text: string): TextRun[] {
  const { fontChoice, fontFallback, ...attributes } = style;
  const font = embeddedRunFont(fontChoice, style.bold, style.italic);
  const run = { ...attributes, ...(font && { font }), text };
  if (!fontFallback || font?.kind !== "embedded" || font.documentFontId) return [run];
  const face = bundledFontBytes(font.fontId);
  const fallback = embeddedRunFont(fontFallback, style.bold, style.italic, true);
  if (!face || !fallback || !missingFontCharacter(face, text)) return [run];
  const glyphs = new Map<string, boolean>();
  const spans: TextRun[] = [];
  for (const char of text.normalize("NFC")) {
    const missing = glyphs.get(char) ?? Boolean(missingFontCharacter(face, char));
    glyphs.set(char, missing);
    const chosen = missing ? fallback : font;
    const previous = spans.at(-1);
    if (previous?.font === chosen) spans[spans.length - 1] = { ...previous, text: previous.text + char };
    else spans.push({ ...attributes, font: chosen, text: char });
  }
  return spans;
}

/**
 * Extracts the draft's paragraphs and inline formatting.
 * @param state A Lexical editor snapshot.
 * @param defaults The base style for unformatted text.
 * @returns Normalised lines of PDF runs.
 */
export function editorTextRuns(state: EditorState, defaults: RunStyle): TextRunLines {
  return state.read(() =>
    normalizeTextRuns(
      $getRoot()
        .getChildren()
        .flatMap((paragraph) => {
          const lines: TextRun[][] = [[]];
          if (!$isElementNode(paragraph)) return lines;
          for (const node of paragraph.getChildren()) {
            if ($isLineBreakNode(node)) lines.push([]);
            if ($isTextNode(node)) {
              const style = readRunStyle(node.getStyle(), node, defaults);
              lines.at(-1)!.push(...runsForText(style, node.getTextContent()));
            }
          }
          return lines;
        }),
    ),
  );
}

/**
 * Applies a CSS property to the selected text or the next characters typed.
 * @param selection The active range.
 * @param property The CSS property.
 * @param value Its new value.
 * @returns Nothing.
 */
export function $patchStyleText(selection: RangeSelection, property: string, value: string): void {
  /** @param css The current style. @returns The patched CSS declarations. */
  const patch = (css: string) => {
    const declarations = { ...getStyleObjectFromCSS(css), [property]: value };
    return Object.entries(declarations)
      .map(([key, entry]) => `${key}: ${entry};`)
      .join(" ");
  };
  if (selection.isCollapsed()) {
    selection.setStyle(patch(selection.style));
    const node = selection.anchor.getNode();
    if ($isElementNode(node) && node.isEmpty()) node.setTextStyle(patch(node.getTextStyle()));
    return;
  }
  const slices = $caretRangeFromSelection(selection).getTextSlices();
  for (const node of selection.getNodes()) {
    if (!$isTextNode(node) || !node.getTextContentSize()) continue;
    const slice = $getTextPointCaretSliceForNode(slices, node);
    if (slice?.distance === 0) continue;
    const target = slice ? $splitTextPointCaretSlice(slice, selection) : node;
    if (target) target.setStyle(patch(target.getStyle()));
  }
}
