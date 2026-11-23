import type { DocumentSession } from "@pdf-editor/core";
import {
  $addUpdateTag,
  $caretRangeFromSelection,
  $getRoot,
  $getSelection,
  $getTextPointCaretSliceForNode,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  $setTextFormat,
  SKIP_DOM_SELECTION_TAG,
  type LexicalEditor,
  type RangeSelection,
} from "lexical";
import { useLayoutEffect } from "react";
import { create } from "zustand";
import { DEFAULT_STYLES } from "../../state/annotation-store";
import { chosenFont, fontChoiceOnPage, releaseDocumentFont } from "./font-model";
import { $patchStyleText, colorHex, FAMILIES, readRunStyle, type RunStyle } from "./text-runs";

export type TextStyle = { [Key in keyof RunStyle]: RunStyle[Key] | null };
export type FormatToggle = "bold" | "italic" | "underline";

export const TEXT_STYLE_TOGGLES = [
  ["bold", "B", "font-extrabold"],
  ["italic", "I", "font-serif italic"],
  ["underline", "U", "underline underline-offset-3"],
] as const;

const defaults: RunStyle = {
  fontFamily: "Helvetica",
  fontSize: DEFAULT_STYLES.textBox.fontSize,
  color: DEFAULT_STYLES.textBox.color,
  bold: false,
  italic: false,
  underline: false,
};

interface DraftStyle {
  readonly pageId: string;
  readonly pageText: boolean;
  readonly text: string;
  readonly blockText: string;
  readonly style: TextStyle;
  apply(patch: Partial<RunStyle>): void;
  focus(): void;
}

const useStyleStore = create<{ next: RunStyle; draft: DraftStyle | null }>(() => ({ next: defaults, draft: null }));

/**
 * Resolves all selected runs, excluding nodes touched only at a selection boundary.
 * @param selection The active range.
 * @param base The draft's initial style.
 * @returns Each common value, or null for a mixed value.
 */
export function $readTextStyle(selection: RangeSelection, base: RunStyle): TextStyle {
  const typing = readRunStyle(selection.style, selection, base);
  if (selection.isCollapsed()) return typing;
  const slices = $caretRangeFromSelection(selection).getTextSlices();
  const styles = selection
    .getNodes()
    .flatMap((node) =>
      $isTextNode(node) && node.getTextContentSize() && $getTextPointCaretSliceForNode(slices, node)?.distance !== 0
        ? [readRunStyle(node.getStyle(), node, base)]
        : [],
    );
  const first = styles[0] ?? typing;

  /** @param key The attribute to compare. @returns Its common value, or null when mixed. */
  const common = <Key extends Exclude<keyof RunStyle, "color">>(key: Key): TextStyle[Key] =>
    styles.every((style) => style[key] === first[key]) ? first[key] : null;

  return {
    fontFamily: common("fontFamily"),
    fontChoice: common("fontChoice"),
    fontFallback: common("fontFallback"),
    fontSize: common("fontSize"),
    color: styles.every((style) => colorHex(style.color) === colorHex(first.color)) ? first.color : null,
    bold: common("bold"),
    italic: common("italic"),
    underline: common("underline"),
  };
}

/**
 * Applies style attributes to the selection or to subsequent typing.
 * @param selection The live selection.
 * @param patch The changed attributes.
 * @returns Nothing.
 */
export function $applyTextStyle(selection: RangeSelection, patch: Partial<RunStyle>): void {
  const picked = chosenFont(patch.fontChoice);
  if (picked) {
    const fallback = chosenFont(patch.fontFallback);
    const family = fallback?.css ?? (patch.fontFamily && FAMILIES[patch.fontFamily].css);
    $patchStyleText(selection, "font-family", family ? `${picked.css}, ${family}` : picked.css);
  } else if (patch.fontFamily) $patchStyleText(selection, "font-family", FAMILIES[patch.fontFamily].css);
  if (patch.fontSize !== undefined) {
    $patchStyleText(selection, "font-size", `calc(var(--pdf-text-scale) * ${patch.fontSize})`);
  }
  if (patch.color) $patchStyleText(selection, "color", colorHex(patch.color));
  $setTextFormat(selection, { bold: patch.bold, italic: patch.italic, underline: patch.underline });
  if (selection.isCollapsed()) {
    const node = selection.anchor.getNode();
    if ($isElementNode(node) && node.isEmpty()) node.setTextFormat(selection.format);
  }
}

/**
 * Connects both formatting surfaces to this editor until the draft closes.
 * @param editor The text editor.
 * @param pageId The draft's page.
 * @param base The fixed defaults for this draft.
 * @param pageText Whether this draft edits an existing PDF line.
 * @returns The draft cleanup.
 */
export function connectTextStyleDraft(
  editor: LexicalEditor,
  pageId: string,
  base: RunStyle,
  pageText = false,
): () => void {
  let saved: RangeSelection | null = null;

  /** @param patch The requested changes. @returns Nothing. */
  const apply = (patch: Partial<RunStyle>) => {
    editor.update(
      () => {
        const current = $getSelection();
        const selection = $isRangeSelection(current) ? current : saved?.clone();
        if (!selection) return;
        if (!editor.getRootElement()?.contains(document.activeElement)) $addUpdateTag(SKIP_DOM_SELECTION_TAG);
        $setSelection(selection);
        $applyTextStyle(selection, patch);
        if (!pageText && selection.isCollapsed()) setNextStyle(patch);
      },
      { discrete: true },
    );
  };

  /** @returns Nothing. */
  const focus = () => {
    editor.update(() => {
      if (saved) $setSelection(saved.clone());
    });
    editor.focus();
  };

  /** @returns Nothing. */
  const publish = () => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) saved = selection.clone();
    const style = saved ? $readTextStyle(saved, base) : base;
    useStyleStore.setState({
      draft: {
        pageId,
        pageText,
        style,
        text: saved?.getTextContent() ?? "",
        blockText: $getRoot().getTextContent(),
        apply,
        focus,
      },
    });
  };

  editor.getEditorState().read(publish);
  const stop = editor.registerUpdateListener(({ editorState }) => editorState.read(publish));
  return () => {
    stop();
    if (useStyleStore.getState().draft?.apply === apply) useStyleStore.setState({ draft: null });
  };
}

/**
 * Registers the editor as the source for both control surfaces.
 * @param editor The text editor.
 * @param pageId The draft's page.
 * @param base The fixed defaults for this draft.
 * @param pageText Whether this draft edits an existing PDF line.
 * @returns Nothing.
 */
export function useTextStyleDraft(editor: LexicalEditor, pageId: string, base: RunStyle, pageText = false): void {
  useLayoutEffect(() => connectTextStyleDraft(editor, pageId, base, pageText), [editor, pageId, base, pageText]);
}

/** @param patch The changed tool defaults. @returns Nothing. */
function setNextStyle(patch: Partial<RunStyle>): void {
  useStyleStore.setState(({ next }) => {
    const changed = { ...next, ...(patch.fontFamily && { fontChoice: undefined }), ...patch };
    if (next.fontChoice !== changed.fontChoice) releaseDocumentFont(next.fontChoice);
    return { next: changed };
  });
}

/** @param patch The requested changes. @returns Nothing. */
export function setTextStyle(patch: Partial<RunStyle>): void {
  const { draft } = useStyleStore.getState();
  (draft?.apply ?? setNextStyle)(patch);
}

/** @returns The style and page shared by the toolbar and Properties. */
export function useTextStyle() {
  const draft = useStyleStore((state) => state.draft);
  const next = useStyleStore((state) => state.next);
  return {
    style: draft?.style ?? next,
    pageId: draft?.pageId,
    pageText: draft?.pageText ?? false,
    selectionText: draft?.text ?? "",
    blockText: draft?.blockText ?? "",
    setStyle: setTextStyle,
  };
}

/** @returns Whether an existing PDF line is being edited. */
export function useEditingPageText(): boolean {
  return useStyleStore((state) => state.draft?.pageText ?? false);
}

/** @returns Nothing. */
export function refreshTextStyle(): void {
  const { draft } = useStyleStore.getState();
  if (draft) useStyleStore.setState({ draft: { ...draft } });
}

/** @returns Nothing. */
export function focusPageTextDraft(): void {
  const { draft } = useStyleStore.getState();
  if (draft?.pageText) draft.focus();
}

/**
 * Reads the defaults to capture when a new draft opens.
 * @param pageId The draft's destination page when known.
 * @param session The editor tab that owns that page.
 * @returns The default run style.
 */
export function getNextTextStyle(pageId?: string, session?: DocumentSession): RunStyle {
  const next = useStyleStore.getState().next;
  if (!pageId || !session || !next.fontChoice) return next;
  return { ...next, fontChoice: fontChoiceOnPage(next.fontChoice, pageId, session) };
}

/**
 * Steps a point size within the supported range, starting at the tool size for mixed text.
 * @param size The current point size, if uniform.
 * @param delta The step direction.
 * @returns A size between 6 and 96 points.
 */
export function stepTextSize(size: number | null, delta: -1 | 1): number {
  return Math.max(6, Math.min(96, (size ?? getNextTextStyle().fontSize) + delta));
}
