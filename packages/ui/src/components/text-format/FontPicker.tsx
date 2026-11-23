import { Check, FilePlus2, Lock, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useEditorServices } from "../../editor/hooks";
import {
  activateFont,
  BUNDLED_FONTS,
  documentChoiceId,
  documentFallback,
  fontSections,
  loadBundledFont,
  recentFonts,
  rememberFont,
  type FontChoice,
} from "./font-model";
import type { RunStyle } from "./text-runs";
import type { TextStyle } from "./use-text-style";

interface FontPickerProps {
  readonly pageId: string;
  readonly blockText: string;
  readonly hasDraft: boolean;
  readonly wide: boolean;
  readonly text: string;
  readonly style: TextStyle;
  onPick(patch: Partial<RunStyle>): void;
}

/**
 * Displays page, recent and bundled faces with search and keyboard selection.
 * @param props The active page, formatting selection and picker callback.
 * @returns The searchable font picker.
 */
export function FontPicker({ pageId, hasDraft, wide, text, blockText, style, onPick }: FontPickerProps) {
  const { session } = useEditorServices();
  const listId = useId();
  const [page, setPage] = useState<{ id: string; fonts: FontChoice[] }>();
  const search = useRef<HTMLInputElement>(null);
  const activation = useRef<AbortController>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [recent] = useState(recentFonts);
  const [error, setError] = useState("");
  const [readyVariant, setReadyVariant] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const italic = style.italic === true;

  useEffect(() => {
    search.current?.focus({ preventScroll: true });
    return () => activation.current?.abort();
  }, []);

  useEffect(() => {
    let current = true;
    Promise.all(BUNDLED_FONTS.map(({ id }) => loadBundledFont(id, italic))).then(
      () => {
        if (current) setReadyVariant(italic);
      },
      () => {
        if (current) setError("Some font previews could not be loaded.");
      },
    );
    return () => {
      current = false;
    };
  }, [italic]);

  useEffect(() => {
    let current = true;
    const previews: FontFace[] = [];
    if (pageId) {
      session
        .readPageFonts(pageId)
        .then(async (fonts) => {
          if (!current) return;
          const rows = await Promise.all(
            fonts.map(async (font): Promise<FontChoice> => {
              const id = documentChoiceId(session, pageId, font.id);
              const bundledId =
                font.style.family === "serif" ? "lora" : font.style.family === "mono" ? "jet-brains-mono" : "inter";
              if (!font.bytes) return { id, name: font.name, bundledId, document: font };
              const preview = `pdf-preview-${listId.replace(/[^a-zA-Z0-9-]/g, "")}-${font.id}`;
              try {
                const face = await new FontFace(preview, font.bytes).load();
                if (current) {
                  document.fonts.add(face);
                  previews.push(face);
                }
                return { id, name: font.name, bundledId, document: font, preview };
              } catch {
                return { id, name: font.name, bundledId, document: font };
              }
            }),
          );
          if (current) setPage({ id: pageId, fonts: rows });
        })
        .catch(() => {
          if (current) setError("The page’s fonts could not be read.");
        });
    }
    return () => {
      current = false;
      for (const preview of previews) document.fonts.delete(preview);
    };
  }, [listId, pageId, session]);

  const pageChoices = page?.id === pageId ? page.fonts : [];
  const block = blockText.replace(/[\r\n]/g, " ");
  const sections = fontSections(pageChoices, recent, query, {
    text: text.replace(/[\r\n]/g, " "),
    italic,
  });
  const enabled = sections.flatMap(({ rows }) => rows.filter(({ blocked }) => !blocked));
  const selected = enabled[active];

  /**
   * Loads and applies an enabled font row.
   * @param row The chosen row and its embedding flags.
   * @returns Nothing.
   */
  const pick = async (row: (typeof enabled)[number]) => {
    if (row.blocked || busy) return;
    if (row.font.standard) {
      onPick({ fontFamily: row.font.standard, fontChoice: undefined, fontFallback: undefined });
      return;
    }
    const controller = new AbortController();
    activation.current = controller;
    setBusy(true);
    try {
      const useDocument = !!documentFallback([row.font], block);
      let fontChoice: string;
      const context = { pageId, session, signal: controller.signal };
      try {
        fontChoice = await activateFont(row.font, useDocument, context);
      } catch (error) {
        if (!useDocument) throw error;
        fontChoice = await activateFont(row.font, false, context);
      }
      let fontFallback: string | undefined;
      const fallback = !row.font.document && hasDraft ? documentFallback(pageChoices, block) : undefined;
      if (fallback && row.missing) {
        fontFallback = await activateFont(fallback, true, context).catch(() => undefined);
      }
      if (controller.signal.aborted) return;
      rememberFont(row.font);
      const documentStyle = fontChoice === row.font.id ? row.font.document?.style : undefined;
      onPick({
        fontChoice,
        fontFallback,
        ...(documentStyle && { bold: documentStyle.bold, italic: documentStyle.italic }),
      });
    } catch {
      if (!controller.signal.aborted) setError("This font could not be opened.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  /** @param event Search input keystroke. @returns Nothing. */
  const navigate = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!enabled.length) return;
    if (event.key === "Enter" && selected) {
      event.preventDefault();
      void pick(selected);
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next =
      active < 0
        ? event.key === "ArrowDown"
          ? 0
          : enabled.length - 1
        : (active + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
    setActive(next);
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="grid max-h-[min(460px,65dvh)] grid-rows-[auto_minmax(0,1fr)_auto]">
      <label className="flex h-11 items-center gap-2 border-b border-divider px-3 text-sm text-muted">
        <Search aria-hidden="true" className="size-4" />
        <input
          role="combobox"
          aria-label="Search fonts"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded="true"
          aria-activedescendant={selected ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 text-ink outline-none placeholder:text-muted"
          placeholder="Search fonts…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(-1);
          }}
          onKeyDown={navigate}
          ref={search}
        />
      </label>
      <div className="min-h-0 overflow-y-auto p-1">
        <div id={listId} role="listbox" aria-label="Fonts" aria-busy={readyVariant !== italic || busy}>
          {sections.map(
            ({ title, rows }) =>
              rows.length > 0 && (
                <div key={title} role="group" aria-label={title}>
                  <p aria-hidden="true" className="px-2 pt-3 pb-1 text-xs font-semibold text-muted">
                    {title}
                  </p>
                  {rows.map((row) => {
                    const { font, blocked, missing } = row;
                    const index = enabled.indexOf(row);
                    const checked = font.standard
                      ? !style.fontChoice && style.fontFamily === font.standard
                      : style.fontChoice === font.id;
                    const usesFallback = font.document && !documentFallback([font], block);
                    const meta = blocked
                      ? "Can't be saved in a PDF"
                      : missing
                        ? `Missing ${missing}`
                        : font.document
                          ? "Document font"
                          : undefined;
                    return (
                      <div
                        key={font.id}
                        id={index >= 0 ? `${listId}-${index}` : undefined}
                        role="option"
                        aria-disabled={blocked}
                        aria-selected={checked}
                        className={[
                          "flex min-h-10 items-center gap-2 rounded-md px-2 max-lg:min-h-12",
                          blocked ? "text-muted" : "cursor-pointer hover:bg-hover",
                          checked || (index >= 0 && active === index) ? "bg-selection" : "",
                        ].join(" ")}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void pick(row)}
                      >
                        <span
                          className="min-w-0 flex-1 truncate text-base"
                          style={{
                            fontFamily:
                              font.standard ??
                              font.preview ??
                              `pdf-face-${font.bundledId}, ${font.document?.style.family ?? "sans-serif"}`,
                            fontStyle: !font.document && italic ? "italic" : undefined,
                          }}
                        >
                          {font.name}
                        </span>
                        {meta && (
                          <span className="grid justify-items-end gap-0.5 text-xs">
                            <span
                              className={blocked || missing ? "flex items-center gap-1 text-warning" : "text-muted"}
                            >
                              {blocked && <Lock aria-hidden="true" className="size-3" />}
                              {meta}
                            </span>
                            {font.document && !blocked && (missing || usesFallback) && (
                              <span className="text-muted" title="Uses a similar bundled font when needed.">
                                {missing ? "Document font · Uses fallback" : "Uses a similar font"}
                              </span>
                            )}
                          </span>
                        )}
                        {checked && <Check aria-hidden="true" className="size-4" />}
                      </div>
                    );
                  })}
                </div>
              ),
          )}
        </div>
        {query && sections.every(({ rows }) => !rows.length) && (
          <p className="p-3 text-sm text-muted">No matching fonts.</p>
        )}
        {!query && (
          <>
            <p className="px-2 pt-3 pb-1 text-xs font-semibold text-muted">On this device</p>
            <p className="mx-1 mb-2 rounded-md bg-hover p-3 text-sm text-muted">
              {wide
                ? "Device fonts will be available in a future update."
                : "Your phone doesn’t share its font list with apps. Add a font file to use any font you have."}
            </p>
            <p className="px-2 pt-3 pb-1 text-xs font-semibold text-muted">Your font files</p>
          </>
        )}
        {error && (
          <p role="status" className="p-2 text-sm text-warning">
            {error}
          </p>
        )}
      </div>
      {!query && (
        <div aria-disabled="true" className="flex min-h-11 items-center gap-2 border-t border-divider px-3 text-sm">
          <FilePlus2 aria-hidden="true" className="size-4 text-muted" />
          Add a font file…
          <span className="ml-auto text-xs text-muted">.ttf .otf .woff2</span>
        </div>
      )}
    </div>
  );
}
