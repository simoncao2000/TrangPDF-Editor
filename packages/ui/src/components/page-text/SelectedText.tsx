import { addAnnotation, newHighlight, pdfRectToScreen, type PageFrame } from "@pdf-editor/core";
import { Copy, Highlighter, MessageSquarePlus, type LucideIcon } from "lucide-react";
import { useEditorServices } from "../../editor/hooks";
import { useAnnotationUi } from "../../state/annotation-store";
import { useTextSelection, type PageTextSelection } from "../../state/text-selection-store";
import { useToast } from "../../state/toast-store";

/** Gap between the menu and the first selected line, in CSS pixels. */
const MENU_GAP = 6;

interface SelectedTextProps {
  readonly pageId: string;
  readonly frame: PageFrame;
  readonly width: number;
  readonly height: number;
}

/**
 * The page text selected on this page: a tint over each line and, once the pointer is let go, a
 * menu above it to copy the text, highlight it, or highlight it and comment.
 * @param props The page, how it is shown and its on-screen size.
 * @returns The tint and the menu, or nothing when nothing on this page is selected.
 */
export function SelectedText({ pageId, frame, width, height }: SelectedTextProps) {
  const selection = useTextSelection((state) => (state.selection?.pageId === pageId ? state.selection : null));
  if (!selection) return null;
  const boxes = selection.rects.map((rect) => pdfRectToScreen(rect, frame));
  const top = Math.min(...boxes.map((box) => box.top));
  const left = Math.min(...boxes.map((box) => box.left));
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height}>
        {boxes.map((box, i) => (
          // The page is paper in both themes, so the tint is the light theme's selection colour.
          <rect
            key={i}
            x={box.left}
            y={box.top}
            width={box.width}
            height={box.height}
            rx={2}
            className="fill-(--palette-light-selection) mix-blend-multiply"
          />
        ))}
      </svg>
      {selection.settled && <SelectionMenu selection={selection} left={left} top={top - MENU_GAP} />}
    </>
  );
}

interface SelectionMenuProps {
  readonly selection: PageTextSelection;
  readonly left: number;
  /** Where the menu's bottom edge goes. */
  readonly top: number;
}

/**
 * Copy, Highlight and Comment for the selected text.
 * @param props The selection and where the menu's bottom-left corner goes.
 * @returns The menu.
 */
function SelectionMenu({ selection, left, top }: SelectionMenuProps) {
  const { session } = useEditorServices();
  const style = useAnnotationUi((state) => state.styles.highlight);
  const selectAnnotation = useAnnotationUi((state) => state.selectToComment);
  const clear = useTextSelection((state) => state.select);
  const showToast = useToast((state) => state.show);

  const highlight = () => {
    const annotation = newHighlight(crypto.randomUUID(), selection.rects, style);
    session.dispatch((content) => addAnnotation(content, selection.pageId, annotation));
    clear(null);
    return annotation.id;
  };
  const copy = () => {
    void navigator.clipboard.writeText(selection.text).then(
      () => showToast("Copied"),
      () => showToast("Couldn’t copy the text.", { tone: "error" }),
    );
  };
  // Selecting the new highlight opens its comment card, ready to write in.
  const comment = () => selectAnnotation({ pageId: selection.pageId, id: highlight() });

  return (
    <div
      role="toolbar"
      aria-label="Selected text"
      // A press here is not a press on the page: it must not clear the selection first.
      data-annotation=""
      className="absolute z-20 flex -translate-y-full gap-0.5 rounded-md bg-raised p-0.5 shadow-2 ring-1 ring-line/50"
      style={{ left, top }}
    >
      <MenuButton icon={Copy} label="Copy" onClick={copy} />
      <MenuButton icon={Highlighter} label="Highlight" onClick={highlight} />
      <MenuButton icon={MessageSquarePlus} label="Comment" onClick={comment} />
    </div>
  );
}

/**
 * One button of the selection menu.
 * @param props Icon, label and click handler.
 * @param props.icon A Lucide icon.
 * @param props.label The button's text.
 * @param props.onClick Called when it is pressed.
 * @returns The button.
 */
function MenuButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Keep the press from starting a new selection on the page under the menu.
      onPointerDown={(event) => event.stopPropagation()}
      className="flex h-7.5 items-center gap-1.5 rounded-sm px-2.5 text-sm text-ink transition-[background-color,transform] duration-(--duration-press) hover:bg-hover active:scale-[0.97]"
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
