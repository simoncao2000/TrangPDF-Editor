import { CSS_PIXELS_PER_POINT, pdfRectToScreen, type PageFrame, type TextBoxAnnotation } from "@pdf-editor/core";
import { useRef } from "react";
import { cssColor } from "./annotation-display";

interface TextBoxEditorProps {
  readonly annotation: TextBoxAnnotation;
  readonly frame: PageFrame;
  /**
   * Called once when editing ends.
   * @param text The typed text, or `null` when the user pressed Escape.
   * @param height The height the text needs, in points (at least the box's height).
   */
  onDone(text: string | null, height: number): void;
}

/**
 * Typing in a text box, in place: a text area laid over the box, turned with the page, in the same
 * font and size the saved file will use. Clicking away or Ctrl/Cmd+Enter keeps the text; Escape
 * throws it away.
 * @param props The text box, how its page is shown, and the done callback.
 * @returns An absolutely positioned text area.
 */
export function TextBoxEditor({ annotation, frame, onDone }: TextBoxEditorProps) {
  const finished = useRef(false);
  const scale = frame.zoom * CSS_PIXELS_PER_POINT;
  const box = pdfRectToScreen(annotation.rect, frame);
  const width = annotation.rect.width * scale;
  const height = annotation.rect.height * scale;

  const finish = (element: HTMLTextAreaElement, text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    // scrollHeight is measured before the rotation transform, in the text's own direction.
    onDone(text, Math.max(annotation.rect.height, element.scrollHeight / scale));
  };

  return (
    <div data-annotation="" className="absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
      <textarea
        // The box was just made or double-clicked: typing should start at once.
        autoFocus
        aria-label="Text box text"
        defaultValue={annotation.text}
        spellCheck
        className="absolute resize-none overflow-hidden bg-transparent outline-2 outline-offset-2 outline-paper-focus outline-dashed"
        style={{
          left: (box.width - width) / 2,
          top: (box.height - height) / 2,
          width,
          height,
          transform: `rotate(${frame.rotation}deg)`,
          color: cssColor(annotation.color),
          opacity: annotation.opacity,
          fontFamily: "Helvetica, Arial, sans-serif",
          fontSize: annotation.fontSize * scale,
          lineHeight: 1.15,
        }}
        onBlur={(event) => finish(event.currentTarget, event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            finish(event.currentTarget, null);
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            finish(event.currentTarget, event.currentTarget.value);
          }
        }}
      />
    </div>
  );
}
