import { useState } from "react";
import { useAnnotationUi } from "../../state/annotation-store";
import { useProfile } from "../../state/profile-store";
import { useViewer } from "../../state/viewer-store";
import { CommentThread } from "./CommentThread";
import { NamePrompt } from "./NamePrompt";
import type { ThreadEntry } from "./use-document-threads";

interface CommentsPanelProps {
  /** Every thread in the document, in page order. */
  readonly threads: readonly ThreadEntry[];
}

/**
 * The Comments tab: who comments are signed as, then every thread grouped by page. Clicking a
 * thread goes to its page and selects its mark, which opens it here and on the page.
 * @param props The threads.
 * @returns The panel's content.
 */
export function CommentsPanel({ threads }: CommentsPanelProps) {
  const selected = useAnnotationUi((state) => state.selected);
  const select = useAnnotationUi((state) => state.select);
  const setTool = useAnnotationUi((state) => state.setTool);
  const goToPage = useViewer((state) => state.goToPage);

  const open = (entry: ThreadEntry) => {
    // Picking Select first: it clears the selection, so the mark is selected after it.
    setTool("select");
    select({ pageId: entry.pageId, id: entry.annotation.id });
    goToPage(entry.pageIndex);
  };

  return (
    <div className="grid content-start gap-3">
      <Identity />
      {threads.length === 0 ? (
        <p className="px-1 text-sm text-muted">No comments yet. Select a mark on the page to comment on it.</p>
      ) : (
        groupByPage(threads).map(([pageIndex, entries]) => (
          <section key={pageIndex} aria-label={`Page ${pageIndex + 1}`} className="grid gap-1">
            <h3 className="px-1 pt-2 font-hand text-base text-muted">Page {pageIndex + 1}</h3>
            {entries.map((entry) => (
              <CommentThread
                key={entry.annotation.id}
                pageId={entry.pageId}
                annotation={entry.annotation}
                open={selected?.pageId === entry.pageId && selected.id === entry.annotation.id}
                onOpen={() => open(entry)}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/**
 * "Commenting as …" with a way to change the name, or a note that it is asked for first.
 * @returns The line, or the name form while it is being changed.
 */
function Identity() {
  const name = useProfile((state) => state.name);
  const setName = useProfile((state) => state.setName);
  const [changing, setChanging] = useState(false);

  if (changing) {
    return (
      <NamePrompt
        initial={name}
        submitLabel="Save"
        onSave={(saved) => {
          setName(saved);
          setChanging(false);
        }}
      />
    );
  }
  if (!name) return <p className="px-1 text-xs text-muted">Your name is asked the first time you comment.</p>;
  return (
    <p className="flex items-baseline gap-1.5 px-1 text-xs text-muted">
      Commenting as <b className="truncate font-semibold text-ink">{name}</b>
      <button type="button" className="ml-auto text-ink underline underline-offset-2" onClick={() => setChanging(true)}>
        Change
      </button>
    </p>
  );
}

/**
 * Threads grouped by page.
 * @param threads Threads in page order.
 * @returns [page index, threads on it] pairs, in page order.
 */
function groupByPage(threads: readonly ThreadEntry[]): [number, ThreadEntry[]][] {
  const groups = new Map<number, ThreadEntry[]>();
  for (const entry of threads) groups.set(entry.pageIndex, [...(groups.get(entry.pageIndex) ?? []), entry]);
  return [...groups.entries()];
}
