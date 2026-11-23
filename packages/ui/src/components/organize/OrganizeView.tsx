import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { clickSelection, pagesLabel } from "@pdf-editor/core";
import { FilePlus2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDocument, useEditorServices } from "../../editor/hooks";
import { useDocumentActions } from "../../editor/use-document-actions";
import { useExport } from "../../editor/use-export";
import { useShortcuts } from "../../hooks/use-shortcut";
import { useOpenPanel, useViewMode } from "../../routing/hooks";
import { useViewer } from "../../state/viewer-store";
import { Button } from "../primitives/Button";
import { PageCanvas } from "../viewer/PageCanvas";
import { usePageDrawInfo } from "../viewer/use-page-geometry";
import { useInsertPending, useStartInsertPages } from "../../editor/use-insert-pages";
import { MoveToSheet } from "./MoveToSheet";
import { PageMenu, type PageMenuAnchor } from "./PageMenu";
import { PhonePageBar } from "./PhonePageBar";
import { PageTile, TILE_PAGE_WIDTH } from "./PageTile";
import { SelectionBar } from "./SelectionBar";

/** A drag starts after the pointer moves this far, so a click still selects. */
const DRAG_START_DISTANCE = 6;
// Sensor options live outside the component: new objects on every render would make dnd-kit rebuild
// its context, and every tile would re-render on each click.
const POINTER_OPTIONS = { activationConstraint: { distance: DRAG_START_DISTANCE } };
const TOUCH_OPTIONS = { activationConstraint: { delay: 450, tolerance: DRAG_START_DISTANCE } };
const KEYBOARD_OPTIONS = {
  coordinateGetter: sortableKeyboardCoordinates,
  keyboardCodes: { start: ["KeyM"], cancel: ["Escape"], end: ["KeyM", "Space", "Enter"] },
};

/**
 * Where moved pages land: the first one takes the dropped-on page's place, before it when moving up
 * and after it when moving down.
 * @param order All page ids in order.
 * @param moving The pages being moved.
 * @param activeId The page under the pointer.
 * @param overId The page it was dropped on.
 * @returns The index among the pages that are not moving, or `null` for no move.
 */
function dropIndex(
  order: readonly string[],
  moving: ReadonlySet<string>,
  activeId: string,
  overId: string,
): number | null {
  if (moving.has(overId)) return null;
  const rest = order.filter((id) => !moving.has(id));
  const movingDown = order.indexOf(activeId) < order.indexOf(overId);
  return rest.indexOf(overId) + (movingDown ? 1 : 0);
}

interface OrganizeViewProps {
  readonly narrow?: boolean;
}

/**
 * The organize mode: every page as a tile you can
 * select, drag to reorder, rotate, extract, delete, or insert other files between.
 * @param props Whether the view is mounted in the phone shell.
 * @returns The organize view, replacing the thumbnail rail and the page viewport.
 */
export function OrganizeView({ narrow = false }: OrganizeViewProps) {
  const { session } = useEditorServices();
  const actions = useDocumentActions();
  const startExport = useExport((state) => state.open);
  const pages = usePageDrawInfo();
  const refs = useDocument((state) => state.pages);
  const sources = useDocument((state) => state.sources);
  const selection = useDocument((state) => state.selection);
  const status = useDocument((state) => state.status);
  const { currentPage, goToPage } = useViewer();
  const { setMode } = useViewMode();
  const { panel, openPanel, closePanel } = useOpenPanel();
  const [dragging, setDragging] = useState<string | null>(null);
  const [menu, setMenu] = useState<PageMenuAnchor | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const pendingHold = useRef<PageMenuAnchor | null>(null);
  const [dragWidth, setDragWidth] = useState(TILE_PAGE_WIDTH);
  const startInsert = useStartInsertPages();
  const inserting = useInsertPending();

  const order = useMemo(() => pages.map((page) => page.id), [pages]);
  const selected = useMemo(() => new Set(selection), [selection]);
  const busy = status === "saving";
  const firstSelected = order.findIndex((id) => selected.has(id));

  const pointer = useSensor(PointerSensor, POINTER_OPTIONS);
  const mouse = useSensor(MouseSensor, POINTER_OPTIONS);
  const touch = useSensor(TouchSensor, TOUCH_OPTIONS);
  const keyboard = useSensor(KeyboardSensor, KEYBOARD_OPTIONS);
  const sensors = useSensors(narrow ? mouse : pointer, narrow ? touch : undefined, keyboard);

  // Stable handlers (they read the latest selection from the store) so memoised tiles stay put.
  const select = useCallback(
    (id: string) => session.select(clickSelection(session.store.getState().selection, id)),
    [session],
  );
  const open = useCallback(
    (index: number) => {
      setMode("read");
      goToPage(index);
    },
    [setMode, goToPage],
  );

  /**
   * Starts a reorder and selects the active page when it is outside the selection.
   * @param id The active page.
   * @returns Nothing.
   */
  function beginDrag(id: string) {
    if (!selected.has(id)) session.select([id]);
    setDragging(id);
  }

  /**
   * Opens the touch menu when the delay elapses. Mouse and keyboard start reordering immediately.
   * @param event The sensor activation.
   * @returns Nothing.
   */
  function onDragStart({ active, activatorEvent }: DragStartEvent) {
    const id = String(active.id);
    const target = activatorEvent.target;
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-page-tile]") : null;
    setDragWidth(narrow ? element?.clientWidth || TILE_PAGE_WIDTH : TILE_PAGE_WIDTH);
    setMore(false);
    if (element && activatorEvent.type === "touchstart") {
      const anchor = { id, element };
      pendingHold.current = anchor;
      setMenu(anchor);
      return;
    }
    setMenu(null);
    beginDrag(id);
  }

  /**
   * Hands an activated hold to the sortable drag once the finger moves past the tolerance.
   * @param event The drag movement.
   * @returns Nothing.
   */
  function onDragMove({ delta }: DragMoveEvent) {
    const held = pendingHold.current;
    if (!held || Math.hypot(delta.x, delta.y) <= DRAG_START_DISTANCE) return;
    pendingHold.current = null;
    setMenu(null);
    beginDrag(held.id);
  }

  /**
   * Leaves a stationary hold menu open, or commits the drop through the existing move action.
   * @param event The released drag.
   * @returns Nothing.
   */
  function onDragEnd({ active, over }: DragEndEvent) {
    const held = pendingHold.current;
    pendingHold.current = null;
    setDragging(null);
    if (held || !over || active.id === over.id) return;
    const moving = selected.has(String(active.id)) ? selection : [String(active.id)];
    const index = dropIndex(order, new Set(moving), String(active.id), String(over.id));
    if (index !== null) actions.move(moving, index);
  }

  /** @returns Nothing. Resets the touch and reorder state after cancellation. */
  function cancelDrag() {
    pendingHold.current = null;
    setMenu(null);
    setDragging(null);
  }

  const canDelete = selection.length > 0 && selection.length < order.length;
  useShortcuts(
    [
      [{ key: "delete" }, () => canDelete && actions.remove(selection)],
      [{ key: "backspace" }, () => canDelete && actions.remove(selection)],
      [{ key: "a", mod: true }, () => session.select(order)],
      [{ key: "escape" }, () => (selection.length ? session.select([]) : setMode("read"))],
    ],
    !inserting && !busy && !menu && !more && !panel && !dragging,
  );

  useShortcuts(
    [
      [
        { key: "escape" },
        () => {
          setMenu(null);
          setMore(false);
        },
      ],
    ],
    Boolean(menu || more),
  );

  const menuIndex = menu ? order.indexOf(menu.id) : -1;
  const menuPage = refs[menuIndex];
  const pageLabel = menuPage ? sources[menuPage.source]?.name.replace(/\.pdf$/i, "") : undefined;
  const draggedPage = dragging ? pages.find((page) => page.id === dragging) : undefined;
  const carriedCount = dragging && selected.has(dragging) ? selection.length : 1;

  return (
    <section
      aria-label="Organize pages"
      className="relative grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-canvas"
    >
      <header
        className={
          narrow ? "px-3 pt-3" : "flex flex-wrap items-center gap-2 border-b border-divider px-4 py-2.5 sm:px-6"
        }
      >
        {narrow ? (
          <div className="grid gap-3">
            <h2 className="font-hand text-(length:--type-md) leading-tight">{pagesLabel(order.length)}</h2>
            <p className="text-sm text-muted">
              Tap pages to select them. Touch and hold one to move it or see its actions.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mr-auto font-hand text-[1.44rem] leading-tight font-normal">
              Organize <span className="font-mono text-sm text-muted">{pagesLabel(order.length)}</span>
            </h2>
            <Button icon={FilePlus2} onClick={() => void startInsert()} disabled={busy}>
              Insert pages…
            </Button>
            <Button variant="ghost" onClick={() => session.select(selection.length === order.length ? [] : order)}>
              {selection.length === order.length ? "Clear selection" : "Select all"}
            </Button>
            <Button variant="primary" onClick={() => open(firstSelected >= 0 ? firstSelected : currentPage)}>
              Done
            </Button>
          </>
        )}
      </header>

      <div
        className={
          narrow ? "min-h-0 overflow-y-auto px-3 pt-3 pb-[120px]" : "min-h-0 overflow-y-auto px-3 pt-4 pb-28 sm:px-6"
        }
        onClick={(event) => event.target === event.currentTarget && session.select([])}
      >
        {!narrow && (
          <p className="mb-3 text-sm text-muted max-sm:hidden">
            Drag pages to reorder. Click or press Space to toggle selection. Press M to move or Enter to open.
          </p>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={cancelDrag}
          autoScroll={!menu}
        >
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <ul
              role="listbox"
              aria-multiselectable="true"
              aria-label="Pages"
              className={
                narrow
                  ? "grid grid-cols-2 gap-x-4 gap-y-5"
                  : "grid grid-cols-[repeat(auto-fill,minmax(142px,1fr))] gap-x-2 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
              }
            >
              {pages.map((page, index) => (
                <PageTile
                  key={page.id}
                  page={page}
                  number={index + 1}
                  selected={selected.has(page.id)}
                  narrow={narrow}
                  held={menu?.id === page.id}
                  dimmed={narrow && Boolean(menu && menu.id !== page.id)}
                  onMenu={setMenu}
                  carried={Boolean(dragging && dragging !== page.id && selected.has(dragging) && selected.has(page.id))}
                  onSelect={select}
                  onOpen={open}
                />
              ))}
            </ul>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}>
            {draggedPage && (
              <div className="relative inline-block rotate-[-2.5deg] border border-paper-line shadow-lift motion-safe:scale-105">
                <PageCanvas
                  docId={draggedPage.docId}
                  pageIndex={draggedPage.sourceIndex}
                  rotation={draggedPage.rotation}
                  revision={draggedPage.revision}
                  width={dragWidth}
                  height={(draggedPage.size.height / draggedPage.size.width) * dragWidth}
                  priority={0}
                />
                {carriedCount > 1 && (
                  <span className="absolute -top-2 -right-2 grid min-w-6 place-items-center rounded-pill bg-signal px-1.5 py-0.5 font-mono text-xs font-semibold text-raised shadow-2">
                    {carriedCount}
                  </span>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {narrow && !menu && !panel && (
        <PhonePageBar
          count={selection.length}
          busy={busy}
          canDelete={canDelete}
          onClear={() => {
            setMore(false);
            session.select([]);
          }}
          onSelectAll={() => session.select(order)}
          onInsert={() => void startInsert()}
          onRead={() => open(currentPage)}
          onRotate={() => actions.rotate(selection, 90)}
          onExtract={() => startExport("selected")}
          onDelete={() => actions.remove(selection)}
          onMore={() => setMore(!more)}
        />
      )}
      {selection.length > 0 && (!narrow || (more && !menu && !panel)) && (
        <div
          className={`pointer-events-none absolute inset-x-0 flex justify-center p-4 *:pointer-events-auto ${narrow ? "bottom-16 z-6" : "bottom-0"}`}
        >
          <SelectionBar
            count={selection.length}
            canDelete={canDelete}
            busy={busy}
            onRotateLeft={() => actions.rotate(selection, -90)}
            onRotateRight={() => actions.rotate(selection, 90)}
            onExtract={() => startExport("selected")}
            onDelete={() => actions.remove(selection)}
            onClear={() => session.select([])}
          />
        </div>
      )}
      {menu && menuIndex >= 0 && (
        <PageMenu
          anchor={menu}
          label={pageLabel || "Page"}
          number={menuIndex + 1}
          narrow={narrow}
          canDelete={!busy && order.length > 1}
          canMove={!busy && order.length > 1}
          onDismiss={() => setMenu(null)}
          onRotate={(degrees) => {
            setMenu(null);
            if (!busy) actions.rotate([menu.id], degrees);
          }}
          onDelete={() => {
            setMenu(null);
            actions.remove([menu.id]);
          }}
          onMove={() => {
            setMenu(null);
            setMoveId(menu.id);
            openPanel("move-to");
          }}
          onInsert={() => {
            setMenu(null);
            if (busy) return;
            session.select([menu.id]);
            void startInsert();
          }}
          onExtract={() => {
            setMenu(null);
            if (!busy) void actions.extract([menu.id]);
          }}
        />
      )}
      {panel === "move-to" && moveId && (
        <MoveToSheet
          key={moveId}
          pages={pages}
          id={moveId}
          onDismiss={closePanel}
          onMove={(index) => closePanel(() => actions.move([moveId], index))}
        />
      )}
    </section>
  );
}
