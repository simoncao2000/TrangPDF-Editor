import { expect, it } from "bun:test";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  createEditor,
} from "lexical";
import { editorTextRuns, type RunStyle } from "./text-runs";
import {
  $readTextStyle,
  connectTextStyleDraft,
  displayTextSize,
  getNextTextStyle,
  setTextStyle,
  stepTextSize,
} from "./use-text-style";

it("resolves selection attributes and reports mixed values across runs", () => {
  const editor = createEditor();
  const base = getNextTextStyle();
  const styled: RunStyle = { ...base, fontFamily: "Times", fontSize: 20, bold: true, color: { r: 31, g: 78, b: 121 } };

  editor.update(
    () => {
      const first = $createTextNode("plain ");
      const second = $createTextNode("styled").toggleFormat("bold");
      second.setStyle("font-family: Times; font-size: calc(var(--pdf-text-scale) * 20); color: #1f4e79;");
      $getRoot().append($createParagraphNode().append(first, second));

      const selection = first.select(6, 6);
      selection.focus.set(second.getKey(), 6, "text");
      expect($readTextStyle(selection, base)).toEqual(styled);

      selection.anchor.set(first.getKey(), 0, "text");
      expect($readTextStyle(selection, base)).toEqual({
        ...base,
        fontFamily: null,
        fontSize: null,
        color: null,
        bold: null,
      });
    },
    { discrete: true },
  );
});

it("routes shared changes to a saved selection or to the next text typed", () => {
  const editor = createEditor();
  const base = getNextTextStyle();
  editor.update(
    () => {
      const text = $createTextNode("Low tide");
      $getRoot().append($createParagraphNode().append(text));
      text.select(4, 8);
    },
    { discrete: true },
  );

  const disconnect = connectTextStyleDraft(editor, "page", base);
  try {
    editor.update(() => $setSelection(null), { discrete: true });
    setTextStyle({ fontFamily: "Courier", bold: true });
    expect(getNextTextStyle()).toEqual(base);
    expect(editorTextRuns(editor.getEditorState(), base)).toEqual([
      [
        { ...base, text: "Low " },
        { ...base, text: "tide", fontFamily: "Courier", bold: true },
      ],
    ]);

    editor.update(() => $getRoot().append($createParagraphNode()).selectEnd(), { discrete: true });
    setTextStyle({ fontSize: 28, italic: true, bold: false });
    editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("Expected typing range");
        selection.insertText("Next");
      },
      { discrete: true },
    );

    expect(editorTextRuns(editor.getEditorState(), base)[1]).toEqual([
      { ...base, text: "Next", fontSize: 28, italic: true },
    ]);
    expect(getNextTextStyle()).toEqual({ ...base, fontSize: 28, italic: true });
  } finally {
    disconnect();
    setTextStyle(base);
  }
});

it("displays and steps from the nearest tenth of a point", () => {
  expect([9.962599754333496, 10.95, 8.5].map(displayTextSize)).toEqual([10, 11, 8.5]);
  expect(stepTextSize(9.962599754333496, -1)).toBe(9);
  expect(stepTextSize(10.95, 1)).toBe(12);
  expect(stepTextSize(8.5, 1)).toBe(9.5);
});
