import { expect, it } from "bun:test";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
} from "lexical";
import { $patchStyleText, editorTextRuns, FAMILIES, type RunStyle } from "./text-runs";

const defaults: RunStyle = {
  fontFamily: "Helvetica",
  fontSize: 14,
  bold: false,
  italic: false,
  underline: false,
  color: { r: 0, g: 0, b: 0 },
};

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
