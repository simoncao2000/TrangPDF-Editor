import {
  Highlighter,
  MousePointer2,
  PenLine,
  RectangleHorizontal,
  RectangleVertical,
  Redo2,
  Square,
  TextCursorInput,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useDocument } from "../../editor/hooks";
import { useDocumentActions } from "../../editor/use-document-actions";
import { useElementSize } from "../../hooks/use-element-size";
import { useShortcuts } from "../../hooks/use-shortcut";
import { useAnnotationUi, type Tool } from "../../state/annotation-store";
import { useLayout } from "../../state/layout-store";
import { useViewer } from "../../state/viewer-store";
import { PLACEMENT_MARGIN, placeInside, type Point, type Size } from "./tool-placement";

interface ToolInfo {
  readonly tool: Tool;
  readonly label: string;
  /** Single-key shortcut, lower case. */
  readonly key: string;
  readonly icon: LucideIcon;
}

const TOOLS: readonly ToolInfo[] = [
  { tool: "select", label: "Select", key: "v", icon: MousePointer2 },
  { tool: "editText", label: "Edit text", key: "e", icon: TextCursorInput },
  { tool: "highlight", label: "Highlight", key: "h", icon: Highlighter },
  { tool: "ink", label: "Draw", key: "d", icon: PenLine },
  { tool: "square", label: "Rectangle", key: "s", icon: Square },
  { tool: "textBox", label: "Add text", key: "t", icon: Type },
];

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
  /**
   * Phone layout: the palette lies flat, starts centred above the bottom bar, and where it is
   * dragged is kept only for this visit (the desktop position is not disturbed).
   */
  readonly phone?: boolean;
}

/**
 * The floating tool palette, Acrobat style: Undo and Redo and the tools on a raised card over the
 * document. Drag its grip to put it anywhere (or press the arrow keys on the grip); the rotate
 * button turns it flat or upright. It is kept inside the document area at every size, so it never
 * goes missing when the window shrinks. V, E, H, D, S and T pick tools; Escape goes back to Select.
 * @param props The area it floats in, whether shortcuts are on, and whether this is the phone layout.
 * @returns The palette.
 */
export function ToolPalette({ area, keysEnabled, phone = false }: ToolPaletteProps) {
  const actions = useDocumentActions();
  const status = useDocument((state) => state.status);
  const undoLabel = useDocument((state) => state.undoLabel);
  const redoLabel = useDocument((state) => state.redoLabel);
  const tool = useAnnotationUi((state) => state.tool);
  const setTool = useAnnotationUi((state) => state.setTool);
  const setMode = useViewer((state) => state.setMode);
  const layout = useLayout();
  const [phonePosition, setPhonePosition] = useState<Point | null>(null);
  const savedPosition = phone ? phonePosition : layout.toolPosition;
  const moveTools = phone ? setPhonePosition : layout.moveTools;
  const paletteRef = useRef<HTMLElement>(null);
  const size = useElementSize(paletteRef);
  const drag = useRef<{ pointerId: number; from: Point; start: Point } | null>(null);
  const [dragged, setDragged] = useState<Point | null>(null);

  const editable = status === "clean" || status === "dirty";
  const upright = !phone && layout.toolOrientation === "vertical";
  // Phones start centred above the bottom bar; elsewhere near the top-left corner.
  const start = phone
    ? { x: (area.width - size.width) / 2, y: area.height - size.height - PLACEMENT_MARGIN }
    : DEFAULT_POSITION;
  const placed = placeInside(dragged ?? savedPosition ?? start, size, area);

  const pick = (next: Tool) => {
    setMode("read");
    setTool(next);
  };

  useShortcuts(
    [
      ...TOOLS.map(({ tool: next, key }) => [{ key }, () => pick(next)] as const),
      [{ key: "escape" }, () => setTool("select")] as const,
    ],
    keysEnabled && editable,
  );

  const onGripDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, from: { x: event.clientX, y: event.clientY }, start: placed };
  };
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
  const onGripUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (dragged) moveTools(dragged);
    setDragged(null);
  };
  const onGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    moveTools(placeInside({ x: placed.x + arrow[0] * KEY_STEP, y: placed.y + arrow[1] * KEY_STEP }, size, area));
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
      className={`absolute top-0 left-0 z-10 flex items-center gap-0.5 bg-raised p-1 shadow-2 ring-1 ring-line/50 ${upright ? "flex-col" : "overflow-x-auto scrollbar-width-none"} ${
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
        {TOOLS.map(({ tool: option, label, key, icon }) => (
          <PaletteButton
            key={option}
            icon={icon}
            label={label}
            shortcut={key.toUpperCase()}
            pressed={option === tool}
            disabled={!editable}
            onClick={() => pick(option)}
          />
        ))}
      </div>
      {!phone && (
        <>
          {divider}
          <PaletteButton
            icon={upright ? RectangleHorizontal : RectangleVertical}
            label={upright ? "Turn the tools flat" : "Turn the tools upright"}
            muted
            onClick={layout.turnTools}
          />
        </>
      )}
    </nav>
  );
}

interface PaletteButtonProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly shortcut?: string;
  /** Pressed state for the tool in hand; leave out for plain actions. */
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  /** Quieter colour for secondary actions (rotate). */
  readonly muted?: boolean;
  onClick(): void;
}

/**
 * A palette button: an icon, its name in the tooltip, and a filled ink square for the tool in hand.
 * @param props Icon, label, shortcut, pressed state and click handler.
 * @returns The button.
 */
function PaletteButton({
  icon: Icon,
  label,
  shortcut,
  pressed,
  disabled = false,
  muted = false,
  onClick,
}: PaletteButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-(--control-target) shrink-0 place-items-center rounded-sm transition-[background-color,color,transform] duration-(--duration-press) ease-out active:scale-[0.94] disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent ${
        pressed ? "bg-action text-on-action" : `${muted ? "text-muted" : "text-ink"} hover:bg-hover`
      }`}
    >
      <Icon className="size-4.5" aria-hidden="true" />
    </button>
  );
}
