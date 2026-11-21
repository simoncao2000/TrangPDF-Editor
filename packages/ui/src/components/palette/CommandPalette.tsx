import type { DocumentMatch } from "@pdf-editor/core";
import { ArrowRight, CornerDownLeft, FileText, Search, TextSearch } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useStore } from "zustand";
import { useDocument, useEditorServices } from "../../editor/hooks";
import { usePalette } from "../../state/palette-store";
import { useViewer } from "../../state/viewer-store";
import { matchScore, parseQuery, tidySnippet } from "./query";
import { useCommands } from "../../editor/use-commands";

/** Text matches shown at most. */
const MATCH_LIMIT = 50;
/** Wait this long after typing stops before searching the document. */
const SEARCH_DELAY_MS = 150;

/** One row of the palette. */
interface Item {
  readonly id: string;
  readonly section: string;
  readonly content: ReactNode;
  readonly hint?: string;
  run(): void;
}

/**
 * The command palette, VS Code style (Ctrl/Cmd+K, or click the search box in the title bar).
 * Typing searches the document's text and the open files' names; ">" lists commands; ":12" goes to
 * page 12. Arrow keys move, Enter runs, Escape closes.
 * @returns The palette while open, otherwise nothing.
 */
export function CommandPalette() {
  const { open, initialQuery, hide } = usePalette();
  if (!open) return null;
  return <PaletteDialog initialQuery={initialQuery} onClose={hide} />;
}

interface PaletteDialogProps {
  readonly initialQuery: string;
  onClose(): void;
}

/**
 * The open palette: the input and its results.
 * @param props What it starts with, and how to close it.
 * @returns The dialog.
 */
function PaletteDialog({ initialQuery, onClose }: PaletteDialogProps) {
  const listId = useId();
  const [raw, setRaw] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const query = parseQuery(raw);
  const items = usePaletteItems(query, onClose);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the highlighted row in range and in view.
  const current = Math.min(active, Math.max(0, items.length - 1));
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + items.length) % Math.max(items.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      items[current]?.run();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-scrim/20 px-4 pt-14" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-label="Command palette" className="flex max-h-[min(70vh,32rem)] w-full max-w-160 flex-col overflow-hidden rounded-md border border-line bg-raised shadow-3">
        <div className="flex items-center gap-2 border-b border-divider px-3">
          <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <input
            // The palette was just opened to type in.
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[current] ? `${listId}-${current}` : undefined}
            aria-label="Search text, open files and commands"
            placeholder="Search text and files · > for commands · :page"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
        </div>
        <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="overflow-y-auto p-1">
          {items.map((item, index) => {
            const heading = index === 0 || items[index - 1]!.section !== item.section ? item.section : null;
            return (
              <li key={item.id} role="presentation">
                {heading && <p className="px-2.5 pt-2 pb-1 text-2xs font-semibold tracking-wide text-muted">{heading}</p>}
                <div
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === current}
                  onPointerMove={() => setActive(index)}
                  onClick={item.run}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm ${index === current ? "bg-selection text-on-selection" : "text-ink"}`}
                >
                  <div className="min-w-0 flex-1">{item.content}</div>
                  {item.hint && <kbd className="shrink-0 font-mono text-2xs opacity-70">{item.hint}</kbd>}
                  {index === current && <CornerDownLeft className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />}
                </div>
              </li>
            );
          })}
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{emptyMessage(query.mode)}</li>}
        </ul>
      </div>
    </div>
  );
}

/**
 * What to say when nothing matches.
 * @param mode The palette mode.
 * @returns A short message.
 */
function emptyMessage(mode: ReturnType<typeof parseQuery>["mode"]): string {
  if (mode === "commands") return "No command matches.";
  if (mode === "page") return "Type a page number, like :12.";
  return "Nothing found in this file or the open files.";
}

/**
 * The rows for what is typed: commands, a page to go to, or open files and text matches.
 * @param query The parsed text.
 * @param close Closes the palette (rows close it after running).
 * @returns The rows, in display order.
 */
function usePaletteItems(query: ReturnType<typeof parseQuery>, close: () => void): readonly Item[] {
  const { workspace, session } = useEditorServices();
  const commands = useCommands();
  const tabs = useStore(workspace.store, (state) => state.tabs);
  const pageCount = useDocument((state) => state.pages.length);
  const fileName = useDocument((state) => state.fileName);
  const { goToPage, showSearchHit } = useViewer();
  const matches = useTextMatches(query.mode === "search" ? query.text : "");

  return useMemo(() => {
    const then = (action: () => void) => () => {
      close();
      action();
    };
    if (query.mode === "commands") {
      return commands
        .filter((command) => command.enabled)
        .map((command) => ({ command, score: matchScore(command.title, query.text) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ command }) => ({ id: command.id, section: "Commands", content: command.title, hint: command.shortcut, run: then(command.run) }));
    }
    if (query.mode === "page") {
      if (query.page === null || query.page > pageCount) return [];
      const page = query.page;
      return [{ id: "go-page", section: "Go to", content: <IconRow icon={<ArrowRight className="size-4" />}>Go to page {page}</IconRow>, run: then(() => goToPage(page - 1)) }];
    }
    const files = tabs
      .map((tab) => ({ tab, name: tab.session.store.getState().fileName ?? "Untitled" }))
      .filter(({ name }) => matchScore(name, query.text) > 0)
      .map(({ tab, name }) => ({ id: `tab-${tab.id}`, section: "Open files", content: <IconRow icon={<FileText className="size-4" />}>{name}</IconRow>, run: then(() => workspace.activate(tab.id)) }));
    const found = matches.map((match, index) => ({
      id: `match-${index}`,
      section: `In ${fileName ?? "this file"}`,
      content: <MatchRow match={match} />,
      hint: `p. ${match.pageNumber}`,
      run: then(() => {
        goToPage(match.pageNumber - 1);
        showSearchHit({ pageId: match.pageId, rects: match.rects });
      }),
    }));
    const commandHint = query.text
      ? []
      : [{ id: "hint-commands", section: "Commands", content: <IconRow icon={<TextSearch className="size-4" />}>Type &gt; to run a command, or :12 to go to page 12</IconRow>, run: () => {} }];
    return [...files, ...found, ...commandHint];
  }, [query, commands, tabs, pageCount, fileName, matches, workspace, session, goToPage, showSearchHit, close]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Text matches in the document in front, searched shortly after typing stops.
 * @param text What to find; blank finds nothing.
 * @returns The matches (the previous ones until the new search finishes).
 */
function useTextMatches(text: string): readonly DocumentMatch[] {
  const { session } = useEditorServices();
  const [matches, setMatches] = useState<readonly DocumentMatch[]>([]);
  useEffect(() => {
    if (!text) return;
    let active = true;
    const timer = setTimeout(() => {
      session.findText(text, MATCH_LIMIT).then(
        (found) => active && setMatches(found),
        () => active && setMatches([]),
      );
    }, SEARCH_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session, text]);
  return text ? matches : [];
}

/**
 * A row with an icon.
 * @param props The icon and the text.
 * @returns The row content.
 */
function IconRow({ icon, children }: { readonly icon: ReactNode; readonly children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="shrink-0 opacity-70" aria-hidden="true">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * A text match with the words around it, the match itself marked.
 * @param props The match.
 * @returns The snippet.
 */
function MatchRow({ match }: { readonly match: DocumentMatch }) {
  const { before, after } = tidySnippet(match.snippet);
  return (
    <span className="block truncate">
      <span className="text-muted">{before}</span>
      <mark className="rounded-xs bg-mark-highlight px-0.5 text-paper-ink">{match.snippet.match}</mark>
      <span className="text-muted">{after}</span>
    </span>
  );
}
