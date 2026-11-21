import { CSS_PIXELS_PER_POINT, pdfRectToScreen, type FontFamilyKind, type PageFrame, type PageTextObject } from "@pdf-editor/core";
import { useRef } from "react";
import { cssColor } from "../annotations/annotation-display";

interface PageTextEditorProps {
  readonly object: PageTextObject;
  readonly frame: PageFrame;
  /**
   * Called once when editing ends.
   * @param text The new text, or `null` when the user pressed Escape.
   */
  onDone(text: string | null): void;
}

const FAMILIES: Record<FontFamilyKind, string> = {
  serif: '"Times New Roman", Times, serif',
  sans: "Helvetica, Arial, sans-serif",
  mono: '"Courier New", Courier, monospace',
};

/** White space around the edited text, in CSS pixels, so it covers the original underneath. */
const PAD = 2;
/** Pages are rendered on pure white; the editor covers the original text with the same colour. */
const PAGE_WHITE = "#ffffff";

/**
 * Editing a line of the page's own text, in place: an input over the text object, in a font that
 * looks like the original, covering it while you type. Enter or clicking away keeps the change;
 * Escape throws it away. The input grows with the text.
 * @param props The text object, how its page is shown, and the done callback.
 * @returns An absolutely positioned input.
 */
export function PageTextEditor({ object, frame, onDone }: PageTextEditorProps) {
  const finished = useRef(false);
  const scale = frame.zoom * CSS_PIXELS_PER_POINT;
  const box = pdfRectToScreen(object.bounds, frame);

  const finish = (text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(text);
  };

  // Lay the text out unrotated, then turn it with the page about the box's centre.
  const width = object.bounds.width * scale + 2 * PAD;
  const height = object.bounds.height * scale + 2 * PAD;
  const turned = frame.rotation !== 0;

  return (
    <div data-annotation="" className="absolute" style={{ left: box.left - PAD, top: box.top - PAD, width: box.width + 2 * PAD, height: box.height + 2 * PAD }}>
      <input
        // Opened by a double-click on the text: typing should start at once.
        autoFocus
        aria-label="Page text"
        defaultValue={object.text}
        spellCheck
        // Cursor at the end: a stray key press must not wipe out the whole line.
        onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
        className="absolute outline-2 outline-offset-1 outline-paper-focus outline-dashed [field-sizing:content]"
        style={{
          left: turned ? (box.width + 2 * PAD - width) / 2 : 0,
          top: turned ? (box.height + 2 * PAD - height) / 2 : 0,
          minWidth: width,
          height,
          padding: `0 ${PAD}px`,
          backgroundColor: PAGE_WHITE,
          transform: turned ? `rotate(${frame.rotation}deg)` : undefined,
          color: cssColor(object.color),
          fontFamily: FAMILIES[object.style.family],
          fontWeight: object.style.bold ? 700 : 400,
          fontStyle: object.style.italic ? "italic" : "normal",
          fontSize: object.fontSize * scale,
          lineHeight: 1,
        }}
        onBlur={(event) => finish(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            finish(null);
          } else if (event.key === "Enter") {
            event.preventDefault();
            finish(event.currentTarget.value);
          }
        }}
      />
    </div>
  );
}
