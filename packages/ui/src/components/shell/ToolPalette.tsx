import { RectangleHorizontal, RectangleVertical, Redo2, Undo2 } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useDocument } from "../../editor/hooks";
import { ALL_TOOLS, PALETTE, TOOL_INFO } from "../../editor/tool-catalog";
import { useDocumentActions } from "../../editor/use-document-actions";
import { useElementSize } from "../../hooks/use-element-size";
import { useShortcuts } from "../../hooks/use-shortcut";
import { useAnnotationUi, type Tool } from "../../state/annotation-store";
import { useLayout } from "../../state/layout-store";
import { useViewMode } from "../../routing/hooks";
import { PLACEMENT_MARGIN, placeInside, type Point, type Size } from "./tool-placement";
import { PaletteButton } from "./PaletteButton";
import { ToolGroupButton } from "./ToolGroupButton";

/** Where the palette sits until the user moves it. */
const DEFAULT_POSITION: Point = { x: PLACEMENT_MARGIN + 4, y: PLACEMENT_MARGIN + 4 };
/** Arrow keys on the grip move the palette this far, in CSS pixels. */
const KEY_STEP = 24;
const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface ToolPaletteProps {
  /** The document area's size; the palette always stays inside it. */
  readonly area: Size;
  /** False while a dialog is open, so single-key shortcuts do not fire behind it. */
  readonly keysEnabled: boolean;
}

/**
 * The floating tool palette, Acrobat style: Undo and Redo and the tools on a raised card over the
 * document. Drag its grip to put it anywhere (or press the arrow keys on the grip); the rotate
 * button turns it flat or upright. It is kept inside the document area at every size, so it never
 * goes missing when the window shrinks. V, E, H, D, S and T pick tools; Escape goes back to Select.
 * @param props The area it floats in and whether shortcuts are on.
 * @returns The palette.
 */
export function ToolPalette({ area, keysEnabled }: ToolPaletteProps) {
  const actions = useDocumentActions();
  const status = useDocument((state) => state.status);
  const undoLabel = useDocument((state) => state.undoLabel);
  const redoLabel = useDocument((state) => state.redoLabel);
  const tool = useAnnotationUi((state) => state.tool);
  const setTool = useAnnotationUi((state) => state.setTool);
  const { setMode } = useViewMode();
  const layout = useLayout();
  const paletteRef = useRef<HTMLElement>(null);
  const size = useElementSize(paletteRef);
  const drag = useRef<{ pointerId: number; from: Point; start: Point } | null>(null);
  const [dragged, setDragged] = useState<Point | null>(null);

  const editable = status === "clean" || status === "dirty";
  const upright = layout.toolOrientation === "vertical";
  const placed = placeInside(dragged ?? layout.toolPosition ?? DEFAULT_POSITION, size, area);

  /**
   * Activates a tool in Read mode.
   * @param next The tool to activate.
   * @returns Nothing.
   */
  const pick = (next: Tool) => {
    setMode("read");
    setTool(next);
  };

  useShortcuts(
    [
      ...ALL_TOOLS.flatMap(({ tool: next, key }) => (key ? [[{ key }, () => pick(next)] as const] : [])),
      [{ key: "escape" }, () => setTool("select")] as const,
    ],
    keysEnabled && editable,
  );

  /**
   * Starts dragging the palette.
   * @param event The pointer press on the grip.
   * @returns Nothing.
   */
  const onGripDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, from: { x: event.clientX, y: event.clientY }, start: placed };
  };
  /**
   * Moves the palette while the grip is held.
   * @param event The pointer movement.
   * @returns Nothing.
   */
  const onGripMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (state?.pointerId !== event.pointerId) return;
    setDragged(
      placeInside(
        { x: state.start.x + event.clientX - state.from.x, y: state.start.y + event.clientY - state.from.y },
        size,
        area,
      ),
    );
  };
  /**
   * Saves the dropped palette position.
   * @param event The pointer release.
   * @returns Nothing.
   */
  const onGripUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (dragged) layout.moveTools(dragged);
    setDragged(null);
  };
  /**
   * Moves the palette from its grip using arrow keys.
   * @param event The key press on the grip.
   * @returns Nothing.
   */
  const onGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    const next = { x: placed.x + arrow[0] * KEY_STEP, y: placed.y + arrow[1] * KEY_STEP };
    layout.moveTools(placeInside(next, size, area));
  };

  const divider = (
    <span
      className={upright ? "my-1 h-px w-6 shrink-0 bg-divider" : "mx-1 h-6 w-px shrink-0 bg-divider"}
      aria-hidden="true"
    />
  );

  return (
    <nav
      ref={paletteRef}
      aria-label="Tools"
      aria-orientation={upright ? "vertical" : "horizontal"}
      style={{ transform: `translate(${placed.x}px, ${placed.y}px)`, maxWidth: area.width - 2 * PLACEMENT_MARGIN }}
      className={`absolute top-0 left-0 z-10 flex items-center gap-0.5 bg-raised p-1 shadow-2 ring-1 ring-line/50 ${upright ? "flex-col" : "scrollbar-width-none overflow-x-auto"} ${
        dragged ? "" : "transition-transform duration-(--duration-pop) ease-out motion-reduce:transition-none"
      }`}
    >
      <button
        type="button"
        aria-label="Move the tools (drag, or press the arrow keys)"
        title="Drag to move"
        className={`group grid shrink-0 cursor-grab touch-none place-items-center active:cursor-grabbing ${upright ? "h-3.5 w-full" : "h-8 w-3.5"}`}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragged(null);
        }}
        onKeyDown={onGripKeyDown}
      >
        <span
          className={`rounded-pill bg-line transition-colors group-hover:bg-muted ${upright ? "h-1 w-6" : "h-6 w-1"}`}
          aria-hidden="true"
        />
      </button>
      <PaletteButton
        icon={Undo2}
        label={undoLabel ? `Undo ${undoLabel.toLowerCase()}` : "Undo"}
        disabled={!editable || !undoLabel}
        onClick={actions.undo}
      />
      <PaletteButton
        icon={Redo2}
        label={redoLabel ? `Redo ${redoLabel.toLowerCase()}` : "Redo"}
        disabled={!editable || !redoLabel}
        onClick={actions.redo}
      />
      {divider}
      <div
        role="group"
        aria-label="Annotation tools"
        className={`flex items-center gap-0.5 ${upright ? "flex-col" : ""}`}
      >
        {PALETTE.map((slot) => {
          if (slot.kind === "group") {
            return (
              <ToolGroupButton
                key={slot.name}
                name={slot.name}
                tools={slot.tools}
                current={tool}
                upright={upright}
                disabled={!editable}
                onPick={pick}
              />
            );
          }
          const { label, key, icon } = TOOL_INFO[slot.tool];
          return (
            <PaletteButton
              key={slot.tool}
              icon={icon}
              label={label}
              shortcut={key?.toUpperCase()}
              pressed={slot.tool === tool}
              disabled={!editable}
              onClick={() => pick(slot.tool)}
            />
          );
        })}
      </div>
      {divider}
      <PaletteButton
        icon={upright ? RectangleHorizontal : RectangleVertical}
        label={upright ? "Turn the tools flat" : "Turn the tools upright"}
        muted
        onClick={layout.turnTools}
      />
    </nav>
  );
}
