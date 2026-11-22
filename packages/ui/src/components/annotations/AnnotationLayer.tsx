import {
  addAnnotation,
  addPageText,
  editAnnotation,
  isEditable,
  isTextMarkup,
  moveAnnotation,
  pageFrame,
  pdfRectToScreen,
  screenDeltaToPdf,
  type Annotation,
  type EditableAnnotation,
  type PageFrame,
  type ScreenPoint,
  type TextBoxAnnotation,
} from "@pdf-editor/core";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useEditorServices } from "../../editor/hooks";
import { isDrawingTool, useAnnotationUi } from "../../state/annotation-store";
import type { PageDrawInfo } from "../viewer/use-page-geometry";
import { ANNOTATION_NAMES } from "./annotation-display";
import { AnnotationShape } from "./AnnotationShape";
import { newTextLines } from "./drawing-geometry";
import { DrawingSurface } from "./DrawingSurface";
import { NewTextEditor } from "./NewTextEditor";
import { TextBoxEditor } from "./TextBoxEditor";
import { CommentCard } from "../comments/CommentCard";
import { HANDLES, handlePosition, type Handle } from "./resize-handles";
import { useAnnotationDrag } from "./use-annotation-drag";
import { usePageAnnotations } from "./use-page-annotations";

interface AnnotationLayerProps {
  readonly page: PageDrawInfo;
  readonly zoom: number;
  /** The page's on-screen size in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

/** Hit areas reach this far past an annotation's box, so thin ones are easy to grab. */
const HIT_SLOP = 4;
const HANDLE_SIZE = 9;
/** Arrow keys move a selected annotation this far, in screen pixels (Shift: ten times). */
const NUDGE = 1;
const NUDGE_FAR = 10;
const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Whether the annotation's box can be resized. Highlights follow their text; annotations from other
 * apps cannot be changed.
 * @param annotation An annotation.
 * @returns True for drawings, rectangles and text boxes.
 */
function isResizable(annotation: Annotation): annotation is EditableAnnotation {
  return isEditable(annotation) && !isTextMarkup(annotation) && annotation.kind !== "note";
}

/**
 * The annotation layer over one page (architecture §9): draws the annotations the editor
 * understands, lets the reader select, move, resize and nudge them, and runs the drawing tools.
 * Annotations from other apps are drawn in the page picture below; here they can only be selected
 * (and then deleted). Double-click a text box annotation to change its text. The page's own text is
 * edited in the page text layer underneath.
 * @param props The page, the zoom and the page's on-screen size.
 * @returns An SVG the size of the page, and the text editor while one is open.
 */
export function AnnotationLayer({ page, zoom, width, height }: AnnotationLayerProps) {
  const { session } = useEditorServices();
  const annotations = usePageAnnotations(page.id, page.revision);
  const frame = useMemo(
    () => pageFrame(page.sourceGeometry, page.rotation, zoom),
    [page.sourceGeometry, page.rotation, zoom],
  );
  const selectedId = useAnnotationUi((state) => (state.selected?.pageId === page.id ? state.selected.id : null));
  const select = useAnnotationUi((state) => state.select);
  const tool = useAnnotationUi((state) => state.tool);
  const toolStyle = useAnnotationUi((state) => (isDrawingTool(state.tool) ? state.styles[state.tool] : null));
  /** A text box annotation (from another app) whose text is being changed. */
  const [textDraft, setTextDraft] = useState<TextBoxAnnotation | null>(null);
  /** Where new page text is being typed (the Text box tool). */
  const [newTextAt, setNewTextAt] = useState<ScreenPoint | null>(null);
  const commit = useCallback(
    (before: EditableAnnotation, after: EditableAnnotation) =>
      session.dispatch((content) => editAnnotation(content, page.id, before, after)),
    [session, page.id],
  );
  const { preview, clearPreview, start, handlers } = useAnnotationDrag(frame, commit);
  // A fresh list from the engine replaces whatever was shown while it loaded.
  useEffect(clearPreview, [annotations, clearPreview]);

  const create = useCallback(
    (annotation: EditableAnnotation) => session.dispatch((content) => addAnnotation(content, page.id, annotation)),
    [session, page.id],
  );

  const finishText = (text: string | null, height: number) => {
    const draft = textDraft;
    setTextDraft(null);
    if (!draft || text === null) return;
    // The box grows downward (in page space) to fit the text; its top edge stays put.
    const { rect } = draft;
    const after = { ...draft, text, rect: { ...rect, y: rect.y + rect.height - height, height } };
    if (text !== draft.text || height !== rect.height) commit(draft, after);
  };

  const finishNewText = (text: string | null) => {
    const at = newTextAt;
    setNewTextAt(null);
    if (!at || !text?.trim() || !toolStyle) return;
    const { lines, angle } = newTextLines(text, at, toolStyle.fontSize, frame);
    session.dispatch((content) =>
      addPageText(content, page.id, lines, { fontSize: toolStyle.fontSize, color: toolStyle.color, angle }),
    );
  };

  const withPreview = preview
    ? annotations.map((annotation) => (annotation.id === preview.id ? preview : annotation))
    : annotations;
  // The text box being typed in is shown by the editor instead.
  const shown = textDraft ? withPreview.filter((annotation) => annotation.id !== textDraft.id) : withPreview;
  const selected = shown.find((annotation) => annotation.id === selectedId) ?? null;

  const onKeyDown = (event: KeyboardEvent<SVGElement>, annotation: Annotation) => {
    const arrow = ARROWS[event.key];
    if (!arrow || !isEditable(annotation)) return;
    event.preventDefault();
    const step = event.shiftKey ? NUDGE_FAR : NUDGE;
    const delta = screenDeltaToPdf({ x: arrow[0] * step, y: arrow[1] * step }, frame);
    commit(annotation, moveAnnotation(annotation, delta.x, delta.y));
  };

  const onPress = (event: PointerEvent<SVGElement>, annotation: Annotation) => {
    event.stopPropagation();
    select({ pageId: page.id, id: annotation.id });
    if (isEditable(annotation)) start(event, annotation, "move");
  };

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={width}
        height={height}
        aria-hidden={shown.length === 0}
        {...handlers}
      >
        {shown.map((annotation) => (
          <AnnotationShape key={annotation.id} annotation={annotation} frame={frame} />
        ))}
        {tool === "select" &&
          shown.map((annotation) => {
            const box = pdfRectToScreen(annotation.rect, frame);
            const isSelected = annotation.id === selectedId;
            return (
              <rect
                key={annotation.id}
                data-annotation=""
                role="button"
                tabIndex={0}
                aria-label={ANNOTATION_NAMES[annotation.kind]}
                aria-pressed={isSelected}
                x={box.left - HIT_SLOP}
                y={box.top - HIT_SLOP}
                width={box.width + 2 * HIT_SLOP}
                height={box.height + 2 * HIT_SLOP}
                fill="transparent"
                className={`pointer-events-auto outline-none ${isSelected && isEditable(annotation) ? "cursor-move" : "cursor-pointer"}`}
                onPointerDown={(event) => onPress(event, annotation)}
                onDoubleClick={() => annotation.kind === "textBox" && setTextDraft(annotation)}
                onFocus={() => select({ pageId: page.id, id: annotation.id })}
                onKeyDown={(event) => onKeyDown(event, annotation)}
              />
            );
          })}
        {tool === "select" && selected && (
          <SelectionFrame
            annotation={selected}
            frame={frame}
            onHandleDown={(event, handle) => isResizable(selected) && start(event, selected, handle)}
          />
        )}
        {isDrawingTool(tool) && toolStyle && !textDraft && !newTextAt && (
          <DrawingSurface
            pageId={page.id}
            tool={tool}
            style={toolStyle}
            frame={frame}
            width={width}
            height={height}
            onCreate={create}
            onTextAt={setNewTextAt}
          />
        )}
      </svg>
      {textDraft && <TextBoxEditor annotation={textDraft} frame={frame} onDone={finishText} />}
      {tool === "select" && selected && !preview && !textDraft && (
        <CommentCard pageId={page.id} annotation={selected} frame={frame} pageWidth={width} />
      )}
      {newTextAt && toolStyle && (
        <NewTextEditor
          at={newTextAt}
          frame={frame}
          fontSize={toolStyle.fontSize}
          color={toolStyle.color}
          onDone={finishNewText}
        />
      )}
    </>
  );
}

interface SelectionFrameProps {
  readonly annotation: Annotation;
  readonly frame: PageFrame;
  onHandleDown(event: PointerEvent<SVGElement>, handle: Handle): void;
}

/**
 * The dashed outline around the selected annotation, with corner handles when it can be resized.
 * @param props The selected annotation, its frame and the handle press callback.
 * @returns SVG elements.
 */
function SelectionFrame({ annotation, frame, onHandleDown }: SelectionFrameProps) {
  const box = pdfRectToScreen(annotation.rect, frame);
  const outline = {
    left: box.left - HIT_SLOP,
    top: box.top - HIT_SLOP,
    width: box.width + 2 * HIT_SLOP,
    height: box.height + 2 * HIT_SLOP,
  };
  return (
    <g>
      <rect
        x={outline.left}
        y={outline.top}
        width={outline.width}
        height={outline.height}
        fill="none"
        className="stroke-paper-focus"
        strokeWidth={1.5}
        strokeDasharray="5 3"
      />
      {isResizable(annotation) &&
        HANDLES.map((handle) => {
          const { x, y } = handlePosition(outline, handle);
          return (
            <rect
              key={handle}
              data-annotation=""
              x={x - HANDLE_SIZE / 2}
              y={y - HANDLE_SIZE / 2}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              rx={2}
              className={`pointer-events-auto fill-paper stroke-paper-focus ${handle === "nw" || handle === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
              strokeWidth={1.5}
              onPointerDown={(event) => {
                event.stopPropagation();
                onHandleDown(event, handle);
              }}
            />
          );
        })}
    </g>
  );
}
