import {
  commentText,
  mergeCommentSegments,
  PLAIN_COMMENT_STYLE,
  plainComment,
  type CommentSegment,
} from "../annotations/comment";
import { COMMENT_INK_HEX, nearestCommentInk } from "../annotations/comment-inks";

/** Maximum rich comment size, measured in UTF-16 code units. */
export const MAX_COMMENT_XHTML = 65_536;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
type Style = Omit<CommentSegment, "text">;

interface Frame {
  readonly name: string;
  readonly style: Style;
}

/**
 * Encodes a segment as the supported XHTML subset.
 * @param segment The text and formatting.
 * @returns XHTML for one segment.
 */
function encodeSegment(segment: CommentSegment): string {
  let text = segment.text
    .replace(/[&<>"']/g, (value) => ESCAPES[value]!)
    .replaceAll("\n", "<br/>")
    .replaceAll("\r", "&#13;");
  if (segment.bold) text = `<b>${text}</b>`;
  if (segment.italic) text = `<i>${text}</i>`;
  const css = [
    segment.underline && "text-decoration:underline",
    segment.ink !== "black" && `color:${COMMENT_INK_HEX[segment.ink]}`,
  ]
    .filter(Boolean)
    .join(";");
  return css ? `<span style="${css}">${text}</span>` : text;
}

/**
 * Builds the two PDF comment fields from one body.
 * @param body The comment segments.
 * @returns Plain text and optional rich XHTML.
 */
export function encodeComment(body: readonly CommentSegment[]): { plain: string; rich: string } {
  const segments = mergeCommentSegments(body);
  const plain = commentText(segments);
  const rich = segments.some(({ bold, italic, underline, ink }) => bold || italic || underline || ink !== "black")
    ? `<body xmlns="http://www.w3.org/1999/xhtml"><p>${segments.map(encodeSegment).join("")}</p></body>`
    : "";
  return { plain, rich };
}

/**
 * Checks whether a draft fits the PDF rich comment reader's limit.
 * @param body The comment segments.
 * @returns Whether the encoded rich field exceeds the limit.
 */
export function isRichCommentTooLarge(body: readonly CommentSegment[]): boolean {
  return encodeComment(body).rich.length > MAX_COMMENT_XHTML;
}

/**
 * Decodes XML character references without interpreting the resulting text as tokens.
 * @param text The encoded text or attribute value.
 * @returns Decoded text.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity: string, key: string) => {
    if (!key.startsWith("#")) return Object.hasOwn(ENTITIES, key) ? ENTITIES[key]! : entity;
    const hex = key[1]?.toLowerCase() === "x";
    const code = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  });
}

/**
 * Applies supported inline styles to an inherited style.
 * @param parent The inherited style.
 * @param name The element name.
 * @param attributes The raw attributes.
 * @returns The style inside the element.
 */
function elementStyle(parent: Style, name: string, attributes: string): Style {
  if (name === "b") return { ...parent, bold: true };
  if (name === "i") return { ...parent, italic: true };
  if (name !== "span") return parent;
  let style = parent;
  const attribute = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const [, key, double, single] of attributes.matchAll(attribute)) {
    if (key?.toLowerCase() !== "style") continue;
    for (const declaration of decodeEntities(double ?? single ?? "").split(";")) {
      const [property, value] = declaration
        .toLowerCase()
        .split(":")
        .map((part) => part.trim());
      if (property === "color" && value) style = { ...style, ink: nearestCommentInk(value) };
      if (property === "text-decoration" && value?.split(/\s+/).includes("underline")) {
        style = { ...style, underline: true };
      }
    }
  }
  return style;
}

/**
 * Reads a size-bounded XHTML fragment using a quoted-attribute-aware token scanner.
 * @param rich The PDF rich comment field.
 * @returns Segments or null for malformed markup.
 */
function tokenize(rich: string): CommentSegment[] | null {
  const tokens = /<!--[^]*?-->|<\?[^]*?\?>|<\/?[a-z][\w:.-]*(?:"[^"]*"|'[^']*'|[^"'<>])*?>|[^<]+/giy;
  const stack: Frame[] = [];
  const segments: CommentSegment[] = [];
  let position = 0;
  const validAttributes = /^(?:\s+[a-z_:][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?$/i;
  const hiddenEnd = { script: /<\/script\s*>/gi, style: /<\/style\s*>/gi };
  let paragraphEnded = false;
  while (position < rich.length) {
    tokens.lastIndex = position;
    const token = tokens.exec(rich)?.[0];
    if (!token) return null;
    position += token.length;
    const parent = stack.at(-1);
    const style = parent?.style ?? PLAIN_COMMENT_STYLE;
    if (!token.startsWith("<")) {
      if (!token.trim() && (paragraphEnded || !parent || parent.name === "body")) continue;
      if (paragraphEnded) segments.push(...plainComment("\n"));
      paragraphEnded = false;
      segments.push({ ...style, text: decodeEntities(token) });
      continue;
    }
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    const [, closing, rawName, attributes] = /^<(\/?)([\w:.-]+)([^]*)>$/.exec(token)!;
    const name = rawName!.toLowerCase();
    if (!closing && !validAttributes.test(attributes ?? "")) return null;
    if (closing) {
      if (name === "br" && !attributes?.trim()) continue;
      if (parent?.name !== name || attributes?.trim()) return null;
      stack.pop();
      if (name === "p") paragraphEnded = true;
    } else if (name === "br") {
      if (paragraphEnded) segments.push(...plainComment("\n"));
      paragraphEnded = false;
      segments.push({ ...style, text: "\n" });
    } else if (!token.endsWith("/>")) {
      if (name === "script" || name === "style") {
        const end = hiddenEnd[name];
        end.lastIndex = position;
        if (!end.exec(rich)) return null;
        position = end.lastIndex;
        continue;
      }
      if (name === "p" && paragraphEnded) {
        segments.push(...plainComment("\n"));
        paragraphEnded = false;
      }
      stack.push({ name, style: elementStyle(style, name, attributes ?? "") });
    }
  }
  return stack.length ? null : mergeCommentSegments(segments);
}

/**
 * Reads a PDF comment using plain text when rich content is missing, too large or invalid.
 * @param rich The PDF rich comment field.
 * @param plain The PDF plain comment field.
 * @returns Safe comment segments.
 */
export function decodeComment(rich: string, plain: string): readonly CommentSegment[] {
  if (!rich || rich.length > MAX_COMMENT_XHTML) return plainComment(plain);
  try {
    return tokenize(rich) ?? plainComment(plain);
  } catch {
    return plainComment(plain);
  }
}
