import {
  addPageText,
  CSS_PIXELS_PER_POINT,
  missingFontCharacter,
  TEXT_RUN_LINE_HEIGHT,
  screenToPdf,
  type PageFrame,
  type ScreenPoint,
} from "@pdf-editor/core";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { SelectionAlwaysOnDisplay } from "@lexical/react/LexicalSelectionAlwaysOnDisplay";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  INSERT_LINE_BREAK_COMMAND,
  PASTE_COMMAND,
  type RangeSelection,
} from "lexical";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useEditorServices } from "../../editor/hooks";
import { useMediaQuery, WIDE_LAYOUT_QUERY } from "../../hooks/use-media-query";
import { alignDraft, anchorOf, type Anchor } from "../text-format/draft-geometry";
import { FormatBar, type FormatPanel } from "../text-format/FormatBar";
import { bundledFontBytes, releaseDocumentFonts } from "../text-format/font-model";
import { TextStyleMenu } from "../text-format/TextStyleMenu";
import { colorHex, displayFont, editorTextRuns, type RunStyle } from "../text-format/text-runs";
import {
  $applyTextStyle,
  getNextTextStyle,
  useTextStyle,
  useTextStyleDraft,
  type FormatToggle,
} from "../text-format/use-text-style";
import { useTextPageColors } from "../text-format/use-text-page-colors";

interface NewTextEditorProps {
  readonly at: ScreenPoint;
  readonly frame: PageFrame;
  readonly pageId: string;
  readonly revision: number;
  onDone(): void;
}

/**
 * Starts an isolated Lexical editor for a new text block.
 * @param props The clicked position, page, base style and commit handler.
 * @returns The editor and its inline formatting tools.
 */
export function NewTextEditor(props: NewTextEditorProps) {
  const { session } = useEditorServices();
  const [defaults] = useState(() => getNextTextStyle(props.pageId, session));
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "AddedPageText",
        editorState: () => {
          const paragraph = $createParagraphNode();
          $getRoot().append(paragraph);
          $applyTextStyle(paragraph.select(), defaults);
        },
        onError: (error) => {
          throw error;
        },
      }}
    >
      <Draft {...props} defaults={defaults} />
    </LexicalComposer>
  );
}

/**
 * Connects the editable block, its live formatting and the final command payload.
 * @param props The editor's page, style and commit callback.
 * @returns The editable text and the floating or docked controls.
 */
function Draft({
  at,
  frame,
  defaults,
  pageId,
  revision,
  onDone,
}: NewTextEditorProps & { readonly defaults: RunStyle }) {
  const [editor] = useLexicalComposerContext();
  const { session } = useEditorServices();
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const scale = frame.zoom * CSS_PIXELS_PER_POINT;
  const { fontSize, color } = defaults;
  useTextStyleDraft(editor, pageId, defaults);
  useEffect(() => () => releaseDocumentFonts(pageId, session, getNextTextStyle().fontChoice), [pageId, session]);
  const { style, selectionText, blockText, setStyle } = useTextStyle();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [panel, setPanel] = useState<FormatPanel | null>(null);
  const [missingGlyph, setMissingGlyph] = useState<string>();
  const range = useRef<RangeSelection | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const returnToEditor = useRef(false);
  const finished = useRef(false);
  const firstBaseline = useRef(0);
  const pageColors = useTextPageColors(pageId, revision);

  /** @returns Nothing. */
  const finish = () => {
    if (finished.current) return;
    const lines = editorTextRuns(editor.getEditorState(), defaults);
    const fonts = new Map<string, ArrayBuffer>();
    for (const run of lines.flat()) {
      if (run.font?.kind !== "embedded") continue;
      const bytes = bundledFontBytes(run.font.fontId);
      if (!bytes) continue;
      const missing = run.font.documentFontId ? undefined : missingFontCharacter(bytes, run.text);
      if (missing) {
        setMissingGlyph(missing);
        return;
      }
      fonts.set(run.font.fontId, bytes);
    }
    finished.current = true;
    if (lines.some((line) => line.length)) {
      for (const [fontId, bytes] of fonts) {
        void session.registerTextFont(pageId, fontId, bytes).catch(() => {});
      }
      const origin = screenToPdf({ x: at.x, y: at.y + firstBaseline.current }, frame);
      session.dispatch((content) => addPageText(content, pageId, lines, { origin, angle: frame.rotation, fontSize }));
    }
    onDone();
  };

  /** @returns Nothing. */
  const closePanel = () => {
    setPanel(null);
    if (returnToEditor.current) {
      requestAnimationFrame(() => {
        editor.update(() => {
          if (range.current) $setSelection(range.current.clone());
        });
        editor.focus();
      });
    } else {
      trigger.current?.focus();
    }
  };

  useLayoutEffect(() => {
    /** @returns Nothing. */
    const position = () => {
      const root = editor.getRootElement();
      if (!root) return;
      const next = anchorOf(root);
      setAnchor((previous) =>
        previous && controls.current?.contains(document.activeElement) ? { ...previous, dock: next.dock } : next,
      );
    };
    /** @returns Nothing. */
    const align = () => {
      const root = editor.getRootElement();
      if (root) {
        const lines = editorTextRuns(editor.getEditorState(), defaults);
        firstBaseline.current = alignDraft(root, lines, { scale, fontSize });
      }
    };
    align();
    position();
    const stopUpdates = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        range.current = selection.clone();
      });
      if (dirtyElements.size || dirtyLeaves.size) align();
      position();
    });
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("selectionchange", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      stopUpdates();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("selectionchange", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [editor, defaults, scale, fontSize]);

  useEffect(() => {
    /** @param event The outside interaction. @returns Nothing. */
    const outside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      if (controls.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[data-text-style-controls]")) {
        setPanel(null);
        return;
      }
      if (editor.getRootElement()?.contains(event.target)) {
        if (event.type === "pointerdown") setPanel(null);
        return;
      }
      finish();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
    };
  });

  useEffect(() => {
    const paste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !("clipboardData" in event) || !event.clipboardData) return false;
        event.preventDefault();
        const lines = event.clipboardData.getData("text/plain").split(/\r\n?|\n/);
        lines.forEach((line, index) => {
          if (index) selection.insertParagraph();
          selection.insertText(line);
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const lineBreak = editor.registerCommand(
      INSERT_LINE_BREAK_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        selection.insertParagraph();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    return () => {
      paste();
      lineBreak();
    };
  }, [editor]);

  /** @param toggle The text format to switch. @returns Nothing. */
  const toggleFormat = (toggle: FormatToggle) => setStyle({ [toggle]: style[toggle] !== true });

  const above = !!anchor && anchor.top >= 54;
  const barTop = anchor ? (above ? anchor.top - 50 : anchor.bottom + 10) : 0;
  const spaceAbove = barTop - 16;
  const spaceBelow = window.innerHeight - barTop - 56;
  const popupAbove = spaceAbove > spaceBelow;
  const popupStyle = {
    maxHeight: Math.max(80, popupAbove ? spaceAbove : spaceBelow),
    ...(popupAbove ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }),
  };
  const left = Math.max(8, anchor?.left ?? 8);
  const barStyle: CSSProperties =
    anchor && wide
      ? {
          left,
          top: above ? anchor.top - 10 : anchor.bottom + 10,
          transform:
            `translateX(min(0px, calc(100vw - ${left + 8}px - 100%))) ` + `translateY(${above ? "-100%" : "0"})`,
        }
      : { bottom: anchor?.dock ?? 0 };

  return (
    <>
      <div
        data-added-text-editor=""
        data-annotation=""
        className="absolute z-4 rounded-xs outline-2 outline-offset-2 outline-paper-focus/70 outline-dashed"
        style={
          {
            "--pdf-text-scale": `${scale}px`,
            left: at.x,
            top: at.y,
            minWidth: fontSize * scale * 2,
            fontSize: fontSize * scale,
            lineHeight: TEXT_RUN_LINE_HEIGHT,
            color: colorHex(color),
            fontFamily: displayFont(defaults)?.css,
            fontOpticalSizing: "none",
            fontKerning: "none",
            fontVariantLigatures: "none",
            fontSynthesis: "none",
          } as CSSProperties
        }
        onInput={() => setMissingGlyph(undefined)}
        onKeyDownCapture={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
            event.preventDefault();
            event.stopPropagation();
            if (panel) closePanel();
            else finish();
            return;
          }
          const shortcut = { b: "bold", i: "italic", u: "underline" } as const;
          const value = shortcut[event.key.toLowerCase() as keyof typeof shortcut];
          if (value && (event.metaKey || event.ctrlKey) && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            toggleFormat(value);
          }
        }}
      >
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="New text"
              spellCheck
              className="min-w-full whitespace-pre caret-paper-focus outline-none"
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <SelectionAlwaysOnDisplay />
        <AutoFocusPlugin />
        {missingGlyph && (
          <div
            role="alert"
            className="absolute top-full left-0 mt-2 w-max max-w-64 rounded-md bg-raised p-2 text-sm text-warning shadow-3"
          >
            The chosen font is missing “{missingGlyph}”. Choose another font to add this text.
          </div>
        )}
      </div>
      {anchor &&
        createPortal(
          <div
            ref={controls}
            data-annotation=""
            className="fixed z-30 max-lg:inset-x-0 max-lg:pb-[env(safe-area-inset-bottom)]"
            style={barStyle}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || (!wide && panel)) return;
              event.preventDefault();
              event.stopPropagation();
              if (panel) closePanel();
              else finish();
            }}
          >
            <FormatBar
              style={style}
              panel={panel}
              onToggle={toggleFormat}
              onSize={(fontSize) => setStyle({ fontSize })}
              onPanel={(next, button) => {
                if (panel === next) {
                  closePanel();
                  return;
                }
                trigger.current = button;
                returnToEditor.current = !!editor.getRootElement()?.contains(document.activeElement);
                setPanel(next);
              }}
            />
            {panel && (
              <TextStyleMenu
                panel={panel}
                pageId={pageId}
                hasDraft
                selectionText={selectionText}
                blockText={blockText}
                style={style}
                pageColors={pageColors}
                wide={wide}
                position={popupStyle}
                onChange={(patch) => {
                  setMissingGlyph(undefined);
                  setStyle(patch);
                }}
                onDismiss={closePanel}
              />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
