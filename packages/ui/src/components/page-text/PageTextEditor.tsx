import { useFrameMove } from "../text-format/FrameEdges";
import {
  CSS_PIXELS_PER_POINT,
  pdfToScreen,
  pdfRectToScreen,
  sameRunStyle,
  type DocumentSession,
  type PageFrame,
  type PageTextObject,
  type TextRun,
  type ScreenPoint,
} from "@pdf-editor/core";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { SelectionAlwaysOnDisplay } from "@lexical/react/LexicalSelectionAlwaysOnDisplay";
import {
  $getSelection,
  $getRoot,
  $getNearestNodeFromDOMNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  PASTE_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useEditorServices } from "../../editor/hooks";
import { useMediaQuery, WIDE_LAYOUT_QUERY } from "../../hooks/use-media-query";
import { useToast } from "../../state/toast-store";
import { cssColor } from "../annotations/annotation-display";
import { anchorOf, type Anchor } from "../text-format/draft-geometry";
import {
  activateDocumentFont,
  bundledFontBytes,
  documentChoiceId,
  loadBundledFont,
  pageFontChoice,
  releaseDocumentFonts,
} from "../text-format/font-model";
import { fitEditorRuns, measureSource } from "../text-format/run-fit";
import { PageTextCover } from "../text-format/PageTextCover";
import { FormatBar, type FormatPanel } from "../text-format/FormatBar";
import {
  $loadPageTextRuns,
  editedPageTextRuns,
  FAMILIES,
  samePageTextRuns,
  type RunStyle,
} from "../text-format/text-runs";
import { TextStyleMenu } from "../text-format/TextStyleMenu";
import { useMenuPresence } from "../text-format/use-menu-presence";
import { useTextPageColors } from "../text-format/use-text-page-colors";
import {
  focusPageTextDraft,
  getNextTextStyle,
  refreshTextStyle,
  useTextStyle,
  useTextStyleDraft,
  type FormatToggle,
} from "../text-format/use-text-style";
import { editorBackground, pixelsIn, ringOf } from "./editor-background";
import { caretAtPoint, collapsedTextSelection } from "./caret-at-point";

interface PageTextEditorProps {
  readonly object: PageTextObject;
  readonly frame: PageFrame;
  readonly pageId: string;
  readonly revision: number;
  readonly clickPoint?: ScreenPoint;
  /** @param runs The edited line, or null on cancel. @returns Nothing. */
  onDone(runs: readonly TextRun[] | null, offset?: { x: number; y: number }): void;
}

/** Extra room around the edited line for the caret and glyph overhang. */
const PAD = 2;
/** Distance beyond the editor padding used to sample the page background. */
const SAMPLE_GAP = 2;

/**
 * Opens the PDF line in Lexical, keeping its source run boundaries for the edit command.
 * @param props The original line, page geometry and completion callback.
 * @returns The in-place editor and its formatting controls.
 */
export function PageTextEditor(props: PageTextEditorProps) {
  const { object, pageId } = props;
  const { session } = useEditorServices();
  const [defaults] = useState<RunStyle>(() => ({
    fontFamily: object.style.family === "serif" ? "Times" : object.style.family === "mono" ? "Courier" : "Helvetica",
    fontSize: object.fontSize,
    color: object.color,
    bold: object.style.bold,
    italic: object.style.italic,
    underline: false,
  }));
  const [source] = useState(() => (object.runs?.length ? object.runs : [{ ...defaults, text: object.text }]));

  return (
    <LexicalComposer
      initialConfig={{
        namespace: "ExistingPageText",
        theme: { text: { bold: "font-bold", italic: "italic", underline: "underline" } },
        editorState: () => $loadPageTextRuns(source, (id) => documentChoiceId(session, pageId, id)),
        onError: (error) => {
          throw error;
        },
      }}
    >
      <Draft {...props} source={source} defaults={defaults} />
    </LexicalComposer>
  );
}

/**
 * Registers the fonts needed by changed runs before the edit goes to the worker.
 * @param session The active editing session.
 * @param pageId The destination page.
 * @param runs The changed runs.
 * @returns When their available font bytes have been registered.
 */
async function registerEditFonts(session: DocumentSession, pageId: string, runs: readonly TextRun[]): Promise<void> {
  const results = await Promise.allSettled(
    runs.map(async (run) => {
      const { font, fontFamily, italic } = run;
      const id = font?.kind === "embedded" ? font.fontId : "";
      const bytes = bundledFontBytes(id);
      if (bytes) {
        await session.registerTextFont(pageId, id, bytes);
        return;
      }
      if (id && !id.startsWith("document:") && !id.startsWith("bundled:")) return;
      if (!id.startsWith("bundled:")) {
        const { needsFallback } = await session.checkPageTextFont(pageId, run, true);
        if (!needsFallback) return;
      }
      const family = font?.kind === "standard" ? font.family : fontFamily;
      const bundled = id.startsWith("bundled:")
        ? id.split(":")[1]!
        : family === "Times"
          ? "lora"
          : family === "Courier"
            ? "jet-brains-mono"
            : "inter";
      const fallback = await loadBundledFont(bundled, italic);
      await session.registerTextFont(pageId, fallback.fontId, fallback.bytes);
    }),
  );
  if (results.some(({ status }) => status === "rejected")) {
    useToast.getState().show("Some fonts could not be loaded.", { tone: "error" });
  }
}

/**
 * Loads only document faces that the existing line uses.
 * @param session The editing session.
 * @param pageId The edited page.
 * @param source The original runs.
 * @returns Whether the page faces have finished loading.
 */
function useSourceFaces(session: DocumentSession, pageId: string, source: readonly TextRun[]): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const activation = { session, pageId, signal: controller.signal };
    const ids = new Set(source.flatMap(({ font }) => (font?.kind === "embedded" ? [font.documentFontId] : [])));
    if (ids.size) {
      void session
        .readPageFonts(pageId)
        .then(async (fonts) => {
          if (controller.signal.aborted) return;
          await Promise.allSettled(
            fonts
              .filter(({ id }) => ids.has(id))
              .map((font) => {
                const choice = pageFontChoice(documentChoiceId(session, pageId, font.id), font);
                return activateDocumentFont(choice, activation).catch(() =>
                  activateDocumentFont({ ...choice, document: { ...font, bytes: undefined } }, activation),
                );
              }),
          );
          if (!controller.signal.aborted) {
            refreshTextStyle();
            setReady(true);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      controller.abort();
      releaseDocumentFonts(pageId, session, getNextTextStyle().fontChoice);
    };
  }, [pageId, session, source]);
  return ready;
}

/**
 * Draws the draft over the page and commits or discards the line as a unit.
 * @param props The page, source runs, defaults and completion callback.
 * @returns The editable line and its live style controls.
 */
function Draft({
  object,
  frame,
  pageId,
  revision,
  clickPoint,
  onDone,
  source,
  defaults,
}: PageTextEditorProps & {
  readonly source: readonly TextRun[];
  readonly defaults: RunStyle;
}) {
  const movement = useFrameMove();
  const [editor] = useLexicalComposerContext();
  const { session } = useEditorServices();
  const overlay = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const [background, setBackground] = useState(() => cssColor(editorBackground([], object.color)));
  const scale = frame.zoom * CSS_PIXELS_PER_POINT;
  const box = pdfRectToScreen(object.bounds, frame);
  const width = object.bounds.width * scale + 2 * PAD;
  const height = object.bounds.height * scale + 2 * PAD;
  useTextStyleDraft(editor, pageId, defaults, true);
  const facesReady = useSourceFaces(session, pageId, source);
  const marker = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!clickPoint) return;
    const root = editor.getRootElement();
    if (!root) return;
    const caret = caretAtPoint(document, root, clickPoint);
    editor.update(() => {
      if (!caret || caret.kind === "start" || caret.kind === "end") {
        if (caret?.kind === "start") $getRoot().selectStart();
        else if (caret?.kind === "end") $getRoot().selectEnd();
        return;
      }
      const lexicalNode = $getNearestNodeFromDOMNode(caret.node);
      if (!$isTextNode(lexicalNode)) return;
      const domLength = caret.node.textContent?.length ?? 0;
      const selection = collapsedTextSelection(caret.offset, domLength);
      lexicalNode.select(selection.anchorOffset, selection.focusOffset);
    });
  }, [clickPoint, editor, facesReady]);

  useLayoutEffect(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    const metrics = measureSource(
      ctx,
      source.map((run) => {
        const id = run.font?.kind === "embedded" && run.font.documentFontId;
        const face = id ? `pdf-face-${documentChoiceId(session, pageId, id)}, ` : "";
        const family = FAMILIES[run.fontFamily ?? defaults.fontFamily].css;
        const style = run.italic ? "italic" : "normal";
        const font = `${style} ${run.bold ? 700 : 400} ${run.fontSize * scale}px ${face}${family}`;
        return { text: run.text, font, originalWidth: run.originalWidth };
      }),
      scale,
    );
    const baselinePoint = source[0]?.baseline;
    const baseline = baselinePoint ? pdfToScreen(baselinePoint, frame).y - box.top + PAD : height / 2;

    /** @returns Nothing. */
    const fit = () => {
      const root = editor.getRootElement();
      if (!root || !marker.current) return;
      fitEditorRuns(root, ctx, metrics, width - 2 * PAD);
      root.style.top = `${baseline - marker.current.offsetTop}px`;
    };
    fit();
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size || dirtyLeaves.size) fit();
    });
  }, [box.top, defaults.fontFamily, editor, facesReady, frame, height, pageId, scale, session, source, width]);

  useLayoutEffect(() => {
    const canvas = overlay.current
      ?.closest("[data-page]")
      ?.querySelector<HTMLCanvasElement>("canvas[data-page-canvas]");
    if (!canvas) return;
    const reach = PAD + SAMPLE_GAP;
    const pixels = pixelsIn(canvas, {
      left: box.left - reach,
      top: box.top - reach,
      width: box.width + 2 * reach,
      height: box.height + 2 * reach,
    });
    setBackground(cssColor(editorBackground(pixels ? ringOf(pixels) : [], object.color)));
  }, [box.left, box.top, box.width, box.height, object.color]);

  /** @param keep Whether to commit the draft. @returns Nothing. */
  const finish = useCallback(
    (keep: boolean) => {
      if (finished.current) return;
      finished.current = true;
      const runs = keep ? editedPageTextRuns(editor.getEditorState(), source, defaults) : null;
      if (!runs || samePageTextRuns(source, runs)) {
        onDone(null, keep ? movement.offsetRef.current : undefined);
        return;
      }
      const changed = runs.filter((run) => !source.some((old) => old.text === run.text && sameRunStyle(old, run)));
      if (changed.length) {
        void registerEditFonts(session, pageId, changed).then(() => onDone(runs, movement.offsetRef.current));
      } else onDone(runs, movement.offsetRef.current);
    },
    [defaults, editor, movement.offsetRef, onDone, pageId, session, source],
  );

  useEffect(() => {
    const paste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !("clipboardData" in event) || !event.clipboardData) return false;
        event.preventDefault();
        selection.insertText(
          event.clipboardData
            .getData("text/plain")
            .replace(/\r\n?|\n/g, " ")
            .replaceAll("\0", ""),
        );
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    /** @returns Whether the browser's Enter action was handled. */
    const enter = () => {
      queueMicrotask(() => finish(true));
      return true;
    };
    const lineBreak = editor.registerCommand(INSERT_LINE_BREAK_COMMAND, enter, COMMAND_PRIORITY_HIGH);
    const paragraph = editor.registerCommand(INSERT_PARAGRAPH_COMMAND, enter, COMMAND_PRIORITY_HIGH);
    return () => {
      paste();
      lineBreak();
      paragraph();
    };
  }, [editor, finish]);

  return (
    <div
      ref={overlay}
      data-page-text-editor=""
      data-annotation=""
      className="absolute z-4"
      style={{ left: box.left - PAD + movement.offset.x, top: box.top - PAD + movement.offset.y }}
    >
      {(movement.offset.x !== 0 || movement.offset.y !== 0) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: -movement.offset.x,
            top: -movement.offset.y,
            width: box.width + 2 * PAD,
            height: box.height + 2 * PAD,
            backgroundColor: background,
          }}
        />
      )}
      <PageTextCover
        background={background}
        width={width}
        height={height}
        style={
          {
            "--pdf-text-scale": `${scale}px`,
            left: (box.width + 2 * PAD - width) / 2,
            top: (box.height + 2 * PAD - height) / 2,
            paddingInline: PAD,
            transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
            fontSize: defaults.fontSize * scale,
            lineHeight: 1,
            fontFamily: FAMILIES[defaults.fontFamily].css,
          } as CSSProperties
        }
        onKeyDownCapture={(event) => {
          if (event.nativeEvent.isComposing || (event.key !== "Escape" && event.key !== "Enter")) return;
          event.preventDefault();
          event.stopPropagation();
          finish(event.key === "Enter");
        }}
      >
        {movement.edges}
        <div className="relative flex items-baseline self-start [&>div:first-child]:self-start">
          <span ref={marker} aria-hidden="true" className="w-0 shrink-0" />
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label="Page text"
                aria-multiline={false}
                enterKeyHint="done"
                spellCheck
                className="relative min-w-full whitespace-pre caret-paper-focus outline-none"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <SelectionAlwaysOnDisplay />
        <AutoFocusPlugin />
      </PageTextCover>
      <PageTextControls editor={editor} pageId={pageId} revision={revision} offset={movement.offset} finish={finish} />
    </div>
  );
}

/**
 * Positions the shared text controls and keeps interactions with them inside the draft.
 * @param props The editor, page, revision and completion callback.
 * @returns A floating bar on desktop or keyboard dock on phones.
 */
function PageTextControls({
  editor,
  pageId,
  revision,
  finish,
  offset,
}: {
  readonly offset: { x: number; y: number };
  readonly editor: LexicalEditor;
  readonly pageId: string;
  readonly revision: number;
  finish(keep: boolean): void;
}) {
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const { style, selectionText, blockText, setStyle } = useTextStyle();
  const pageColors = useTextPageColors(pageId, revision);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [panel, setPanel] = useState<FormatPanel | null>(null);
  const mountedPanel = useMenuPresence(panel, wide);
  const controls = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const editorFocused = useRef(false);

  useLayoutEffect(() => {
    /** @returns Nothing. */
    const position = () => {
      const root = editor.getRootElement();
      if (!root) return;
      const next = anchorOf(root);
      const focused = document.activeElement?.closest("[data-text-style-controls]");
      setAnchor((previous) => (previous && focused ? { ...previous, dock: next.dock } : next));
    };
    position();
    const stop = editor.registerUpdateListener(position);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("selectionchange", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      stop();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("selectionchange", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [editor, offset]);

  useEffect(() => {
    /** @param event The outside interaction. @returns Nothing. */
    const outside = (event: Event) => {
      if (!(event.target instanceof Element) || controls.current?.contains(event.target)) return;
      if (event.target.closest("[data-text-style-controls], [data-page-text-editor]")) {
        if (event.type === "pointerdown") setPanel(null);
        return;
      }
      finish(true);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
    };
  }, [finish]);

  /** @returns Nothing. */
  const close = () => {
    setPanel(null);
    if (editorFocused.current) requestAnimationFrame(focusPageTextDraft);
    else trigger.current?.focus({ preventScroll: true });
  };

  /** @param format The style toggle. @returns Nothing. */
  const toggle = (format: FormatToggle) => setStyle({ [format]: style[format] !== true });

  if (!anchor) return null;
  const above = anchor.top >= 54;
  const left = Math.max(8, anchor.left);
  const top = above ? anchor.top - 10 : anchor.bottom + 10;
  return createPortal(
    <div
      ref={controls}
      data-annotation=""
      data-text-style-controls=""
      className="fixed z-30 max-lg:inset-x-0 max-lg:pb-[env(safe-area-inset-bottom)]"
      style={
        wide
          ? {
              left,
              top,
              transform: `translateX(min(0px, calc(100vw - ${left + 8}px - 100%))) translateY(${above ? "-100%" : "0"})`,
            }
          : { bottom: anchor.dock }
      }
      onKeyDown={(event) => {
        if (event.key !== "Escape" || (!wide && panel)) return;
        event.preventDefault();
        event.stopPropagation();
        if (panel) close();
        else finish(false);
      }}
    >
      <FormatBar
        style={style}
        panel={panel}
        onToggle={toggle}
        onSize={(fontSize) => setStyle({ fontSize })}
        onPanel={(next, button) => {
          if (panel === next) {
            close();
            return;
          }
          trigger.current = button;
          editorFocused.current = !!editor.getRootElement()?.contains(document.activeElement);
          setPanel(next);
        }}
      />
      {mountedPanel && (
        <TextStyleMenu
          panel={mountedPanel}
          trigger={trigger}
          closing={!panel}
          pageId={pageId}
          hasDraft
          pageText
          selectionText={selectionText}
          blockText={blockText}
          style={style}
          pageColors={pageColors}
          wide={wide}
          onChange={setStyle}
          onDismiss={close}
        />
      )}
    </div>,
    document.body,
  );
}
