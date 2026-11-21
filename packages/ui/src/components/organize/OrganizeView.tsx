import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { clickSelection, pagesLabel } from "@pdf-editor/core";
import { FilePlus2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useDocument, useEditorServices } from "../../editor/hooks";
import { useDocumentActions } from "../../editor/use-document-actions";
import { useShortcuts } from "../../hooks/use-shortcut";
import { useViewer } from "../../state/viewer-store";
import { Button } from "../primitives/Button";
import { PageCanvas } from "../viewer/PageCanvas";
import { usePageDrawInfo } from "../viewer/use-page-geometry";
import { useInsertPending, useStartInsertPages } from "../../editor/use-insert-pages";
import { PageTile, TILE_PAGE_WIDTH } from "./PageTile";
import { SelectionBar } from "./SelectionBar";

/** A drag starts after the pointer moves this far, so a click still selects. */
const DRAG_START_DISTANCE = 6;
// Sensor options live outside the component: new objects on every render would make dnd-kit rebuild
// its context, and every tile would re-render on each click.
const POINTER_OPTIONS = { activationConstraint: { distance: DRAG_START_DISTANCE } };
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
function dropIndex(order: readonly string[], moving: ReadonlySet<string>, activeId: string, overId: string): number | null {
  if (moving.has(overId)) return null;
  const rest = order.filter((id) => !moving.has(id));
  const movingDown = order.indexOf(activeId) < order.indexOf(overId);
  return rest.indexOf(overId) + (movingDown ? 1 : 0);
}

/**
 * The organize mode: every page as a tile you can
 * select, drag to reorder, rotate, extract, delete, or insert other files between.
 * @returns The organize view, replacing the thumbnail rail and the page viewport.
 */
export function OrganizeView() {
  const { session } = useEditorServices();
  const actions = useDocumentActions();
  const pages = usePageDrawInfo();
  const selection = useDocument((state) => state.selection);
  const status = useDocument((state) => state.status);
  const { currentPage, setMode, goToPage } = useViewer();
  const [dragging, setDragging] = useState<string | null>(null);
  const startInsert = useStartInsertPages();
  const inserting = useInsertPending();

  const order = useMemo(() => pages.map((page) => page.id), [pages]);
  const selected = useMemo(() => new Set(selection), [selection]);
  const busy = status === "saving";
  const firstSelected = order.findIndex((id) => selected.has(id));

  const sensors = useSensors(useSensor(PointerSensor, POINTER_OPTIONS), useSensor(KeyboardSensor, KEYBOARD_OPTIONS));

  // Stable handlers (they read the latest selection from the store) so memoised tiles stay put.
  const select = useCallback((id: string) => session.select(clickSelection(session.store.getState().selection, id)), [session]);
  const open = useCallback(
    (index: number) => {
      setMode("read");
      goToPage(index);
    },
    [setMode, goToPage],
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    if (!selected.has(id)) {
      session.select([id]);
    }
    setDragging(id);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || active.id === over.id) return;
    const moving = selected.has(String(active.id)) ? selection : [String(active.id)];
    const index = dropIndex(order, new Set(moving), String(active.id), String(over.id));
    if (index !== null) actions.move(moving, index);
  };

  const canDelete = selection.length > 0 && selection.length < order.length;
  useShortcuts(
    [
      [{ key: "delete" }, () => canDelete && actions.remove(selection)],
      [{ key: "backspace" }, () => canDelete && actions.remove(selection)],
      [{ key: "a", mod: true }, () => session.select(order)],
      [{ key: "escape" }, () => (selection.length ? session.select([]) : setMode("read"))],
    ],
    !inserting && !busy,
  );

  const draggedPage = dragging ? pages.find((page) => page.id === dragging) : undefined;
  const carriedCount = dragging && selected.has(dragging) ? selection.length : 1;

  return (
    <section aria-label="Organize pages" className="relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-canvas">
      <header className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-2.5 sm:px-6">
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
      </header>

      <div className="min-h-0 overflow-y-auto px-3 pt-4 pb-28 sm:px-6" onClick={(event) => event.target === event.currentTarget && session.select([])}>
        <p className="mb-3 text-sm text-muted max-sm:hidden">Drag pages to reorder. Click or press Space to toggle selection. Press M to move or Enter to open.</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <ul role="listbox" aria-multiselectable="true" aria-label="Pages" className="grid grid-cols-[repeat(auto-fill,minmax(142px,1fr))] gap-x-2 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
              {pages.map((page, index) => (
                <PageTile
                  key={page.id}
                  page={page}
                  number={index + 1}
                  selected={selected.has(page.id)}
                  carried={Boolean(dragging && dragging !== page.id && selected.has(dragging) && selected.has(page.id))}
                  onSelect={select}
                  onOpen={open}
                />
              ))}
            </ul>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}>
            {draggedPage && (
              <div className="relative inline-block rotate-[-2.5deg] scale-105 border border-paper-line shadow-lift">
                <PageCanvas
                  docId={draggedPage.docId}
                  pageIndex={draggedPage.sourceIndex}
                  rotation={draggedPage.rotation}
                  revision={draggedPage.revision}
                  width={TILE_PAGE_WIDTH}
                  height={(draggedPage.size.height / draggedPage.size.width) * TILE_PAGE_WIDTH}
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

      {selection.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 [&>*]:pointer-events-auto">
          <SelectionBar
            count={selection.length}
            canDelete={canDelete}
            busy={busy}
            onRotateLeft={() => actions.rotate(selection, -90)}
            onRotateRight={() => actions.rotate(selection, 90)}
            onExtract={() => void actions.extract(selection)}
            onDelete={() => actions.remove(selection)}
            onClear={() => session.select([])}
          />
        </div>
      )}

    </section>
  );
}
