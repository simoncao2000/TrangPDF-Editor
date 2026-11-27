import { canEmbedLocalFont, missingFontCharacter } from "@pdf-editor/core";
import type { FontFileRecord } from "@pdf-editor/shared";
import { Check, FilePlus2, Lock, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { requestDeviceFonts, requestedDeviceFonts, supportsDeviceFonts } from "./device-fonts";
import { addFontFile } from "./font-files";
import { useEditorServices } from "../../editor/hooks";
import {
  activateFont,
  activateDocumentFont,
  activateLocalFont,
  BUNDLED_FONTS,
  bundledFontBytes,
  checkDocumentFontRows,
  chosenFont,
  documentChoiceId,
  documentFallback,
  fontSections,
  loadBundledFont,
  pageFontChoice,
  readLocalFont,
  recentFonts,
  releaseFontFile,
  rememberFont,
  type FontChoice,
} from "./font-model";
import type { RunStyle } from "./text-runs";
import type { TextStyle } from "./use-text-style";

interface FontPickerProps {
  readonly pageId: string;
  readonly blockText: string;
  readonly hasDraft: boolean;
  readonly pageText?: boolean;
  readonly wide: boolean;
  readonly text: string;
  readonly style: TextStyle;
  onPick(patch: Partial<RunStyle>): void;
}

/**
 * Displays document, bundled and local faces with search and keyboard selection.
 * @param props The active page, formatting selection and picker callback.
 * @returns The searchable font picker.
 */
export function FontPicker({ pageId, hasDraft, pageText, wide, text, blockText, style, onPick }: FontPickerProps) {
  const { session, fontFiles } = useEditorServices();
  const listId = useId();
  const [page, setPage] = useState<{ id: string; fonts: FontChoice[] }>();
  const [files, setFiles] = useState<FontFileRecord[]>();
  const [filePreviews, setFilePreviews] = useState<ReadonlySet<string>>(new Set());
  const [device, setDevice] = useState<FontChoice[]>();
  const [deviceRequest, setDeviceRequest] = useState(requestedDeviceFonts);
  const [deviceError, setDeviceError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const activation = useRef<AbortController>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [recent] = useState(recentFonts);
  const [error, setError] = useState("");
  const [readyVariant, setReadyVariant] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState<{
    pageId: string;
    text: string;
    missing: ReadonlyMap<string, string | undefined>;
  }>();
  const sample = text.replace(/[\r\n]/g, " ");
  const italic = style.italic === true;
  const canShowDevice = wide && supportsDeviceFonts();

  useEffect(() => {
    if (!canShowDevice || !deviceRequest) return;
    let current = true;
    void deviceRequest.then(
      (fonts) => {
        if (current) setDevice(fonts);
      },
      (error: unknown) => {
        if (!current) return;
        const denied = error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name);
        setDeviceError(
          denied
            ? "Font access was denied. Allow local fonts in your browser’s site settings, then reload."
            : "Your device’s fonts could not be listed.",
        );
      },
    );
    return () => {
      current = false;
    };
  }, [canShowDevice, deviceRequest]);

  useEffect(() => {
    if (!fontFiles) return;
    let current = true;
    void fontFiles.list().then(
      (records) => {
        if (current) {
          setFiles(records.map((record) => ({ ...record, bytes: bundledFontBytes(record.id) ?? record.bytes })));
        }
      },
      () => {
        if (!current) return;
        setFiles([]);
        setError("Your saved fonts could not be opened.");
      },
    );
    return () => {
      current = false;
    };
  }, [fontFiles]);

  useEffect(() => {
    if (!files?.length) return;
    let current = true;
    const faces: FontFace[] = [];
    for (const record of files) {
      if (chosenFont(record.id)) continue;
      void Promise.resolve()
        .then(() => new FontFace(`pdf-file-preview-${record.id}`, record.bytes).load())
        .then((face) => {
          if (!current) return;
          document.fonts.add(face);
          faces.push(face);
          setFilePreviews((previews) => new Set([...previews, record.id]));
        })
        .catch(() => {
          // A failed preview can still be listed with the embedding flag.
        });
    }
    return () => {
      current = false;
      for (const face of faces) document.fonts.delete(face);
    };
  }, [files]);

  /**
   * Stores the chosen file after worker validation.
   * @param file The file selected in the system picker.
   * @returns Nothing.
   */
  const addFile = async (file: File) => {
    if (!fontFiles || busy) return;
    setBusy(true);
    setError("");
    try {
      const record = await addFontFile(fontFiles, file, session.prepareFont);
      setFiles((current) => [...(current ?? []), record]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "This font file could not be saved on this device.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Removes a saved font and its registered source.
   * @param id The font record id.
   * @returns Nothing.
   */
  const removeFile = async (id: string) => {
    if (!fontFiles || busy) return;
    setBusy(true);
    setError("");
    try {
      await fontFiles.remove(id);
      releaseFontFile(id);
      setFiles((current) => current?.filter((record) => record.id !== id));
      setFilePreviews((current) => new Set([...current].filter((preview) => preview !== id)));
      setActive(-1);
      await session.releaseTextFont(id);
    } catch {
      setError("The font file could not be removed.");
    } finally {
      setBusy(false);
    }
  };

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
              const choice = pageFontChoice(id, font);
              if (!font.bytes) return choice;
              const preview = `pdf-preview-${listId.replace(/[^a-zA-Z0-9-]/g, "")}-${font.id}`;
              try {
                const face = await new FontFace(preview, font.bytes).load();
                if (current) {
                  document.fonts.add(face);
                  previews.push(face);
                }
                return { ...choice, preview };
              } catch {
                return choice;
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

  useEffect(() => {
    if (!pageText || page?.id !== pageId || !sample) return;
    let current = true;
    void checkDocumentFontRows(page.fonts, sample, (run) => session.checkPageTextFont(pageId, run)).then((missing) => {
      if (current) setCoverage({ pageId, text: sample, missing });
    });
    return () => {
      current = false;
    };
  }, [page, pageId, pageText, sample, session]);

  const pageChoices = page?.id === pageId ? page.fonts : [];
  const block = blockText.replace(/[\r\n]/g, " ");
  const sections = fontSections(pageChoices, recent, query, {
    text: sample,
    italic,
    documentCoverage: pageText
      ? coverage?.pageId === pageId && coverage.text === sample
        ? coverage.missing
        : new Map()
      : undefined,
    device: canShowDevice ? (device ?? []) : [],
    files:
      files?.map((record): FontChoice => ({
        id: record.id,
        name: record.family,
        bundledId: "inter",
        preview:
          chosenFont(record.id)?.css ?? (filePreviews.has(record.id) ? `pdf-file-preview-${record.id}` : undefined),
        local: { kind: "file", bytes: record.bytes },
      })) ?? [],
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
    setError("");
    try {
      const context = { pageId, session, signal: controller.signal };
      const documentFont = row.font.document;
      if (pageText && documentFont) {
        await activateDocumentFont(row.font, context).catch(() =>
          activateDocumentFont({ ...row.font, document: { ...documentFont, bytes: undefined } }, context),
        );
        if (controller.signal.aborted) return;
        const { family, bold, italic: slanted } = documentFont.style;
        onPick({
          fontChoice: row.font.id,
          fontFamily: family === "serif" ? "Times" : family === "mono" ? "Courier" : "Helvetica",
          bold,
          italic: slanted,
        });
        return;
      }
      const useDocument = !!documentFallback([row.font], block);
      let fontChoice: string;
      let missing = row.missing;
      if (row.font.local) {
        const bytes = await readLocalFont(row.font, session);
        controller.signal.throwIfAborted();
        if (!canEmbedLocalFont(bytes)) {
          setError("This font can’t be saved in a PDF.");
          return;
        }
        missing = missingFontCharacter(bytes, block);
        fontChoice = await activateLocalFont(row.font, bytes, context);
      } else {
        try {
          fontChoice = await activateFont(row.font, useDocument, context);
        } catch (error) {
          if (!useDocument) throw error;
          fontChoice = await activateFont(row.font, false, context);
        }
      }
      let fontFallback: string | undefined;
      const fallback = !row.font.document && hasDraft ? documentFallback(pageChoices, block) : undefined;
      if (fallback && missing) {
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
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(row.font.local && failure instanceof Error ? failure.message : "This font could not be opened.");
      }
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
          {sections.map(({ title, rows }) => {
            const deviceSection = title === "On this device";
            const showEmpty = !query && (deviceSection || title === "Your font files");
            if (!rows.length && !showEmpty) return null;
            const heading = deviceSection && !wide ? "On this phone" : title;
            return (
              <div key={title} role="group" aria-label={heading}>
                <p aria-hidden="true" className="px-2 pt-3 pb-1 text-xs font-semibold text-muted">
                  {heading}
                  {deviceSection && canShowDevice && device && (
                    <span className="font-normal"> · {device.length} fonts</span>
                  )}
                </p>
                {deviceSection && !canShowDevice && (
                  <p className="mx-1 mb-2 rounded-xs bg-hover p-3 text-sm text-muted">
                    {wide
                      ? "This browser doesn’t share its font list with apps. Add a font file to use any font you have."
                      : "A phone doesn’t share its font list with apps. Add a font file to use any font you have."}
                  </p>
                )}
                {deviceSection && canShowDevice && !device && (
                  <div className="mx-1 mb-2 grid gap-2 rounded-xs bg-hover p-3 text-sm text-muted">
                    {deviceError ? (
                      <p role="status">{deviceError}</p>
                    ) : (
                      <button
                        type="button"
                        className="w-fit text-left font-semibold text-ink hover:underline"
                        disabled={!!deviceRequest}
                        onClick={() => setDeviceRequest(requestDeviceFonts())}
                      >
                        {deviceRequest ? "Waiting for font access…" : "Show fonts on this device"}
                      </button>
                    )}
                  </div>
                )}
                {rows.map((row) => {
                  const { font, blocked, missing } = row;
                  const index = enabled.indexOf(row);
                  const checked = font.standard
                    ? !style.fontChoice && style.fontFamily === font.standard
                    : style.fontChoice === font.id;
                  const usesFallback = !pageText && font.document && !documentFallback([font], block);
                  const meta = blocked
                    ? "Can't be saved in a PDF"
                    : missing
                      ? `Missing ${missing}`
                      : font.document
                        ? "Document font"
                        : font.local?.kind === "file"
                          ? "Added by you"
                          : undefined;
                  return (
                    <div key={font.id} className="relative">
                      <div
                        id={index >= 0 ? `${listId}-${index}` : undefined}
                        role="option"
                        aria-disabled={blocked}
                        aria-selected={checked}
                        className={[
                          "flex min-h-10 items-center gap-2 rounded-[2px] px-2 max-lg:min-h-12",
                          blocked ? "text-muted" : "cursor-pointer hover:bg-hover",
                          font.local?.kind === "file" ? "pr-18" : "",
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
                        {checked && <Check aria-hidden="true" className="size-4 shrink-0" />}
                      </div>
                      {font.local?.kind === "file" && (
                        <button
                          type="button"
                          className="absolute inset-y-0 right-2 px-1 text-xs text-muted hover:text-ink"
                          aria-label={`Remove ${font.name}`}
                          disabled={busy}
                          onClick={() => void removeFile(font.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {query && sections.every(({ rows }) => !rows.length) && (
          <p className="p-3 text-sm text-muted">No matching fonts.</p>
        )}
      </div>
      <div>
        {error && (
          <p role="status" className="border-t border-divider px-3 py-2 text-sm text-warning">
            {error}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".ttf,.otf,.woff2"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void addFile(file);
          }}
        />
        <button
          type="button"
          disabled={!fontFiles || !files || busy}
          onClick={() => fileInput.current?.click()}
          className="flex min-h-11 w-full items-center gap-2 border-t border-divider px-3 text-left text-sm hover:bg-hover"
        >
          <FilePlus2 aria-hidden="true" className="size-4 text-muted" />
          Add a font file…
          <span className="ml-auto text-xs text-muted">.ttf .otf .woff2</span>
        </button>
      </div>
    </div>
  );
}
