/**
 * Importing pages from another file: after a file is picked (see `use-insert-pages`), choose where
 * its pages go. Mounted once by the app.
 */
import { useDocument } from "../../editor/hooks";
import { useInsertFlowState } from "../../editor/use-insert-pages";
import { useViewer } from "../../state/viewer-store";
import { InsertPagesDialog, type InsertPosition } from "./InsertPagesDialog";

/**
 * The position dialog for a picked file: at the start, after the selected (or current) page, or at
 * the end.
 * @returns The dialog while a file waits, otherwise nothing.
 */
export function InsertPagesFlow() {
  const { pending, set } = useInsertFlowState();
  const pages = useDocument((state) => state.pages);
  const selection = useDocument((state) => state.selection);
  const currentPage = useViewer((state) => state.currentPage);
  if (!pending) return null;

  const lastSelected = pages.findLastIndex((page) => selection.includes(page.id));
  const after = lastSelected >= 0 ? lastSelected : currentPage;
  const positions: InsertPosition[] = [
    { id: "start", label: "At the start", detail: "Before page 1", index: 0 },
    {
      id: "after",
      label: `After page ${after + 1}`,
      detail: lastSelected >= 0 ? "After the last selected page" : "After the page you were reading",
      index: after + 1,
    },
    { id: "end", label: "At the end", detail: `After page ${pages.length}`, index: pages.length },
  ];
  return (
    <InsertPagesDialog
      fileName={pending.name}
      pageCount={pending.pageCount}
      positions={positions}
      initialPosition={pending.atEnd ? "end" : "after"}
      onInsert={(index) => {
        pending.insert(index);
        set(null);
      }}
      onCancel={() => {
        pending.cancel();
        set(null);
      }}
    />
  );
}
