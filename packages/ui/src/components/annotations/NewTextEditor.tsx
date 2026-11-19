import { CSS_PIXELS_PER_POINT, type PageFrame, type Rgb, type ScreenPoint } from "@pdf-editor/core";
import { useRef } from "react";
import { cssColor } from "./annotation-display";
import { LINE_HEIGHT } from "./drawing-geometry";

interface NewTextEditorProps {
  /** Where the text starts (its top-left), in screen pixels on the page. */
  readonly at: ScreenPoint;
  readonly frame: PageFrame;
  readonly fontSize: number;
  readonly color: Rgb;
  /**
   * Called once when typing ends.
   * @param text The typed text, or `null` when the user pressed Escape.
   */
  onDone(text: string | null): void;
}

/**
 * Typing new page text where the user clicked. Lines break only where Enter is pressed, and the
 * box grows with the text. The font and line height match what is written into the page
 * (Helvetica, 1.15), so the text lands where it was typed. Clicking away or Ctrl/Cmd+Enter keeps
 * it; Escape throws it away.
 * @param props Where, how the page is shown, the style, and the done callback.
 * @returns An absolutely positioned text area.
 */
export function NewTextEditor({ at, frame, fontSize, color, onDone }: NewTextEditorProps) {
  const finished = useRef(false);
  const size = fontSize * frame.zoom * CSS_PIXELS_PER_POINT;

  const finish = (text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(text);
  };

  return (
    <textarea
      data-annotation=""
      // Opened by a click with the Text tool: typing should start at once.
      autoFocus
      aria-label="New text"
      rows={1}
      wrap="off"
      spellCheck
      className="absolute resize-none overflow-hidden bg-transparent whitespace-pre outline-2 outline-offset-2 outline-paper-focus outline-dashed [field-sizing:content]"
      style={{ left: at.x, top: at.y, minWidth: size * 2, color: cssColor(color), fontFamily: "Helvetica, Arial, sans-serif", fontSize: size, lineHeight: LINE_HEIGHT, padding: 0 }}
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          finish(event.currentTarget.value);
        }
      }}
    />
  );
}
