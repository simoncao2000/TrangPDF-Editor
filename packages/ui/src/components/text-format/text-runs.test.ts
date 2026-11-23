import { expect, it } from "bun:test";
import type { TextRun } from "@pdf-editor/core";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
} from "lexical";
import {
  $loadPageTextRuns,
  $patchStyleText,
  editedPageTextRuns,
  editorTextRuns,
  FAMILIES,
  samePageTextRuns,
  type RunStyle,
} from "./text-runs";
import { connectTextStyleDraft, getNextTextStyle, setTextStyle } from "./use-text-style";

const defaults: RunStyle = {
  fontFamily: "Helvetica",
  fontSize: 14,
  bold: false,
  italic: false,
  underline: false,
  color: { r: 0, g: 0, b: 0 },
};

it("round-trips source PDF runs without merging, trimming or rebuilding their face references", () => {
  const font = {
    kind: "embedded",
    fontId: "document:7",
    documentFontId: "7",
    name: "Source Serif",
    weight: 700,
    italic: true,
  } as const;
  const face = { ...defaults, fontFamily: "Times", font, bold: true, italic: true, fontSize: 18.375 } as const;
  const source: TextRun[] = [
    { ...defaults, text: "Same " },
    { ...defaults, text: "style " },
    { ...face, text: "different ", color: { r: 31, g: 78, b: 121 }, underline: true },
    { ...face, text: "face  " },
  ];
  const editor = createEditor();
  editor.update(() => $loadPageTextRuns(source, (id) => `source-${id}`), { discrete: true });
  expect(editedPageTextRuns(editor.getEditorState(), source, defaults)).toEqual(source);

  const before = getNextTextStyle();
  const disconnect = connectTextStyleDraft(editor, "page", defaults, true);
  try {
    const color = { r: 17, g: 34, b: 51 };
    setTextStyle({ color });
    expect(editedPageTextRuns(editor.getEditorState(), source, defaults)).toEqual(source);
    editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("Expected caret");
        selection.insertText("more");
      },
      { discrete: true },
    );
    const edited = editedPageTextRuns(editor.getEditorState(), source, defaults);
    expect(edited).toEqual([...source, { ...face, color, text: "more" }]);
    expect(samePageTextRuns(source, edited)).toBe(false);
    expect(getNextTextStyle()).toEqual(before);
  } finally {
    disconnect();
  }
});

it("exports a changed font for the selected part and keeps untouched source runs exact", () => {
  const source: readonly TextRun[] = [
    { ...defaults, text: "Before " },
    { ...defaults, text: "middle" },
    { ...defaults, text: " after" },
  ];
  const editor = createEditor();
  editor.update(
    () => {
      $loadPageTextRuns(source, (id) => id);
      $getRoot().getAllTextNodes()[1]!.select(0, 3);
    },
    { discrete: true },
  );
  const disconnect = connectTextStyleDraft(editor, "page", defaults, true);
  try {
    setTextStyle({ fontFamily: "Courier" });
    expect(editedPageTextRuns(editor.getEditorState(), source, defaults)).toEqual([
      source[0]!,
      { ...defaults, text: "mid", fontFamily: "Courier" },
      { ...defaults, text: "dle" },
      source[2]!,
    ]);
  } finally {
    disconnect();
  }
});

it("converts formatted paragraphs to runs with the internal spaces intact", () => {
  const editor = createEditor();
  editor.update(
    () => {
      const first = $createParagraphNode();
      const middle = $createTextNode("tide").toggleFormat("bold").toggleFormat("italic").toggleFormat("underline");
      middle.setStyle("font-family: Times, serif; font-size: calc(var(--pdf-text-scale) * 22); color: #1f4e79;");
      first.append($createTextNode("Low "), $createTextNode(""), middle, $createTextNode("  tonight   "));
      $getRoot().append(first, $createParagraphNode(), $createParagraphNode().append($createTextNode("Bring a coat")));
    },
    { discrete: true },
  );

  expect(editorTextRuns(editor.getEditorState(), defaults)).toEqual([
    [
      { ...defaults, text: "Low " },
      {
        text: "tide",
        fontFamily: "Times",
        fontSize: 22,
        bold: true,
        italic: true,
        underline: true,
        color: { r: 31, g: 78, b: 121 },
      },
      { ...defaults, text: "  tonight" },
    ],
    [],
    [{ ...defaults, text: "Bring a coat" }],
  ]);
});

it("patches only selected characters and merges identical neighbouring runs", () => {
  const editor = createEditor();
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      const first = $createTextNode("Low tide ");
      const second = $createTextNode("at noon").setStyle("color: #000000;");
      $getRoot().append(paragraph.append(first, second));
      const selection = first.select(4, 4);
      selection.focus.set(second.getKey(), 2, "text");
      $patchStyleText(selection, "font-family", FAMILIES.Courier.css);
      const current = $getSelection();
      if (!$isRangeSelection(current)) throw new Error("Expected text selection");
      $patchStyleText(current, "color", "#1f4e79");
    },
    { discrete: true },
  );

  expect(editorTextRuns(editor.getEditorState(), defaults)).toEqual([
    [
      { ...defaults, text: "Low " },
      { ...defaults, text: "tide at", fontFamily: "Courier", color: { r: 31, g: 78, b: 121 } },
      { ...defaults, text: " noon" },
    ],
  ]);
});

it("uses the patched CSS for the next characters typed into an empty paragraph", () => {
  const editor = createEditor();
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      $getRoot().append(paragraph);
      const selection = paragraph.selectStart();
      $patchStyleText(selection, "font-family", FAMILIES.Times.css);
      selection.insertText("Hello");
    },
    { discrete: true },
  );
  expect(editorTextRuns(editor.getEditorState(), defaults)).toEqual([
    [{ ...defaults, text: "Hello", fontFamily: "Times" }],
  ]);
});
