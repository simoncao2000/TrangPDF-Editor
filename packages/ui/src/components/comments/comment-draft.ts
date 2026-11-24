import {
  COMMENT_INKS,
  mergeCommentSegments,
  nearestCommentInk,
  PLAIN_COMMENT_STYLE,
  type CommentInk,
  type CommentSegment,
} from "@pdf-editor/core";
import {
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  getStyleObjectFromCSS,
  type LexicalNode,
} from "lexical";

export const COMMENT_INK_CLASS: Record<CommentInk, string> = {
  black: "text-ink",
  navy: "text-comment-navy",
  blue: "text-comment-blue",
  teal: "text-comment-teal",
  moss: "text-comment-moss",
  brown: "text-comment-brown",
  plum: "text-comment-plum",
  amber: "text-comment-amber",
};

/**
 * Gets the themed CSS colour for an ink.
 * @param ink The named ink.
 * @returns A reference to the theme token.
 */
export function commentInkColor(ink: CommentInk): string {
  return `var(--comment-ink-${ink})`;
}

/**
 * Gets the known ink represented by the comment editor's CSS.
 * @param css The CSS colour value.
 * @returns An ink when it uses a known theme token.
 */
export function commentInkOf(css: string | undefined): CommentInk | undefined {
  return COMMENT_INKS.find((ink) => commentInkColor(ink) === css);
}

/**
 * Creates Lexical text and line breaks using the comment's supported styles.
 * @param body The comment segments.
 * @returns Inline nodes for the draft.
 */
export function $commentNodes(body: readonly CommentSegment[]): LexicalNode[] {
  return body.flatMap(({ text, ink, bold, italic, underline }) =>
    text.split(/\r\n?|\n/).flatMap((line, index) => {
      const nodes: LexicalNode[] = index ? [$createLineBreakNode()] : [];
      if (!line) return nodes;
      const node = $createTextNode(line);
      if (bold) node.toggleFormat("bold");
      if (italic) node.toggleFormat("italic");
      if (underline) node.toggleFormat("underline");
      if (ink !== "black") node.setStyle(`color: ${commentInkColor(ink)};`);
      nodes.push(node);
      return nodes;
    }),
  );
}

/**
 * Reads the supported styles and text of a Lexical node.
 * @param node A draft node.
 * @returns Its comment segments.
 */
function $draftSegments(node: LexicalNode): CommentSegment[] {
  if ($isTextNode(node)) {
    return [
      {
        text: node.getTextContent(),
        bold: node.hasFormat("bold"),
        italic: node.hasFormat("italic"),
        underline: node.hasFormat("underline"),
        ink: commentInkOf(getStyleObjectFromCSS(node.getStyle()).color) ?? "black",
      },
    ];
  }
  if ($isLineBreakNode(node)) {
    const previous = node.getPreviousSibling();
    const style = $isTextNode(previous) ? $draftSegments(previous)[0] : undefined;
    return [{ ...(style ?? PLAIN_COMMENT_STYLE), text: "\n" }];
  }
  return $isElementNode(node) ? node.getChildren().flatMap($draftSegments) : [];
}

/**
 * Reads the active draft as a comment body.
 * @returns Coalesced text with the existing composer whitespace trimming.
 */
export function $readCommentDraft(): CommentSegment[] {
  const segments = mergeCommentSegments(
    $getRoot()
      .getChildren()
      .flatMap((node, index) => [...(index ? [{ ...PLAIN_COMMENT_STYLE, text: "\n" }] : []), ...$draftSegments(node)]),
  );
  const first = segments.findIndex(({ text }) => text.trim());
  if (first < 0) return [];
  const last = segments.findLastIndex(({ text }) => text.trim());
  const trimmed = segments.slice(first, last + 1);
  trimmed[0] = { ...trimmed[0]!, text: trimmed[0]!.text.trimStart() };
  const end = trimmed.length - 1;
  trimmed[end] = { ...trimmed[end]!, text: trimmed[end]!.text.trimEnd() };
  return trimmed;
}

/**
 * Maps a sanitized clipboard colour to a named ink.
 * @param css The detached element's parsed CSS colour.
 * @returns A named ink.
 */
function pastedInk(css: string): CommentInk {
  const rgb = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(css);
  const hex = rgb
    ? "#" +
      rgb
        .slice(1)
        .map((value) => Number(value).toString(16).padStart(2, "0"))
        .join("")
    : css;
  const named = COMMENT_INKS.find((ink) => ink === css.toLowerCase());
  return commentInkOf(css) ?? named ?? nearestCommentInk(hex);
}

const BLOCKS = new Set(["P", "DIV", "LI", "UL", "OL", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6"]);
type DraftStyle = Omit<CommentSegment, "text">;

/**
 * Extracts supported formatting from inert clipboard markup.
 * @param node The clipboard node.
 * @param parent The inherited style.
 * @param segments The destination segments.
 * @returns Nothing.
 */
function readPastedNode(node: Node, parent: DraftStyle, segments: CommentSegment[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    segments.push({ ...parent, text: node.textContent ?? "" });
    return;
  }
  if (!(node instanceof HTMLElement) || ["SCRIPT", "STYLE", "TEMPLATE"].includes(node.tagName)) return;
  const { tagName, style } = node;
  const block = BLOCKS.has(tagName);
  if (tagName === "BR" || (block && segments.length && !segments.at(-1)!.text.endsWith("\n"))) {
    segments.push({ ...parent, text: "\n" });
  }
  const color = style.color || (tagName === "FONT" ? node.getAttribute("color") : "");
  const next = {
    bold:
      parent.bold ||
      tagName === "B" ||
      tagName === "STRONG" ||
      style.fontWeight === "bold" ||
      Number(style.fontWeight) >= 600,
    italic: parent.italic || tagName === "I" || tagName === "EM" || style.fontStyle === "italic",
    underline:
      parent.underline ||
      tagName === "U" ||
      style.textDecoration.includes("underline") ||
      style.textDecorationLine.includes("underline"),
    ink: color ? pastedInk(color) : parent.ink,
  };
  for (const child of node.childNodes) readPastedNode(child, next, segments);
}

/**
 * Reads pasted formatting in an inert template and builds model segments from text only.
 * @param html The clipboard HTML.
 * @returns Only text, bold, italic, underline and named inks.
 */
export function pastedComment(html: string): CommentSegment[] {
  if (html.length > 65_536) return [];
  const template = document.createElement("template");
  template.innerHTML = html;
  const segments: CommentSegment[] = [];
  // Template nodes use a separate owner document, but share the browser's HTMLElement prototype.
  for (const node of template.content.childNodes) readPastedNode(node, PLAIN_COMMENT_STYLE, segments);
  return mergeCommentSegments(segments);
}
