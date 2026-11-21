import type { RecentFile } from "@pdf-editor/shared";
import { useCallback, useEffect, useState } from "react";
import { useEditorServices } from "../../editor/hooks";
import { useFileOpener } from "../../editor/use-file-opener";
import { Button } from "../primitives/Button";
import { File } from "lucide-react";

/**
 * Formats when a file was opened, relative to today.
 * @param timestamp Epoch milliseconds.
 * @returns "Today, 09:12", "Yesterday" or a short date.
 */
function formatOpenedAt(timestamp: number): string {
  const opened = new Date(timestamp);
  const today = new Date();
  const days = Math.round(
    (new Date(today.toDateString()).getTime() - new Date(opened.toDateString()).getTime()) / 86_400_000,
  );
  if (days === 0) return `Today, ${opened.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "Yesterday";
  return opened.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * The recent files list on the start screen. Shown only where files can be reopened later
 * (Chromium's File System Access API).
 * @returns The list, or nothing while there are no recent files.
 */
export function RecentFiles() {
  const { files } = useEditorServices();
  const { openRecent } = useFileOpener();
  const [recent, setRecent] = useState<RecentFile[]>([]);

  useEffect(() => {
    // Without kept file access (browsers other than Chromium) recent files could not be reopened.
    if (!files.canSaveInPlace) return;
    let active = true;
    files.listRecent().then(
      (list) => active && setRecent(list),
      () => active && setRecent([]),
    );
    return () => {
      active = false;
    };
  }, [files]);

  const clear = useCallback(async () => {
    await files.clearRecent();
    setRecent([]);
  }, [files]);

  if (!files.canSaveInPlace || recent.length === 0) return null;

  return (
    <section className="grid gap-2" aria-labelledby="recent-title">
      <div className="flex items-baseline justify-between">
        <h2 id="recent-title" className="text-sm font-semibold">
          Recent
        </h2>
        <Button variant="ghost" className="min-h-7 text-xs" onClick={clear}>
          Clear
        </Button>
      </div>
      <ul className="grid gap-0.5 rounded-sm border border-divider bg-raised p-1">
        {recent.map((file) => (
          <li key={file.id}>
            <button
              type="button"
              disabled={!file.canReopen}
              onClick={() => openRecent(file.id, file.name)}
              title={file.canReopen ? undefined : "This browser can’t reopen files by itself. Choose it again."}
              className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="grid h-9.5 w-7.5 place-items-center rounded-xs border border-paper-line bg-paper text-paper-muted">
                <File className="size-4" aria-hidden="true" />
              </span>
              <span className="grid min-w-0">
                <span className="truncate text-sm font-semibold">{file.name}</span>
                <span className="text-xs text-muted">
                  {file.pageCount} {file.pageCount === 1 ? "page" : "pages"}
                </span>
              </span>
              <span className="font-mono text-xs text-muted">{formatOpenedAt(file.openedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
