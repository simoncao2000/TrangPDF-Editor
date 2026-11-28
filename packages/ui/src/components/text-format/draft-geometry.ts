import { TEXT_RUN_LINE_HEIGHT, textRunLineSize, type TextRunLines } from "@pdf-editor/core";

/** Distance to the first baseline, in em, matching the earlier Add text editor. */
const FIRST_BASELINE_EM = 0.9215;

export interface Anchor {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
  readonly dock: number;
}

/**
 * Reads the browser's selection position and the visible bottom edge above the keyboard.
 * @param root The editable block.
 * @returns The selection or draft bounds, and the keyboard offset.
 */
export function anchorOf(root: HTMLElement): Anchor {
  const selection = window.getSelection();
  const range = selection?.rangeCount && root.contains(selection.anchorNode) ? selection.getRangeAt(0) : null;
  const start = range?.getClientRects()[0];
  const rect = start && (start.height || start.width) ? start : root.getBoundingClientRect();
  const viewport = window.visualViewport;
  return {
    left: rect.left,
    top: rect.top,
    bottom: start ? (range?.getBoundingClientRect().bottom ?? rect.bottom) : rect.bottom,
    dock: viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0,
  };
}

/**
 * Aligns the editor paragraphs to the PDF writer's baselines.
 * @param root The editable block.
 * @param lines The styled lines.
 * @param metrics CSS pixel scale and the default point size.
 * @returns The first baseline offset in CSS pixels.
 */
export function alignDraft(
  root: HTMLElement,
  lines: TextRunLines,
  metrics: { scale: number; fontSize: number },
): number {
  const { scale, fontSize } = metrics;
  const sizes = lines.map((line) => textRunLineSize(line, fontSize));
  const baseline = (sizes[0] ?? fontSize) * scale * FIRST_BASELINE_EM;
  const paragraphs = Array.from(root.children) as HTMLElement[];

  // Measure in a hidden copy so Lexical never observes changes to its managed content.
  const mirror = document.createElement("div");
  const computed = getComputedStyle(root);
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed",
    left: "0",
    top: "0",
    visibility: "hidden",
    width: "max-content",
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    lineHeight: String(TEXT_RUN_LINE_HEIGHT),
    whiteSpace: "pre",
  });
  mirror.style.setProperty("--pdf-text-scale", `${scale}px`);
  const marks = paragraphs.map((paragraph, index) => {
    if (!lines[index]?.length) return null;
    const line = paragraph.cloneNode(true) as HTMLElement;
    const mark = document.createElement("span");
    mark.style.cssText = "display:inline-block;width:0;height:0";
    line.append(mark);
    mirror.append(line);
    return { line, mark };
  });

  document.body.append(mirror);
  const offsets = marks.map((item) =>
    item ? baseline - (item.mark.getBoundingClientRect().top - item.line.getBoundingClientRect().top) : 0,
  );
  mirror.remove();

  let height = 0;
  for (const [index, paragraph] of paragraphs.entries()) {
    const pitch = (sizes[index] ?? fontSize) * scale * TEXT_RUN_LINE_HEIGHT;
    paragraph.style.height = `${pitch}px`;
    paragraph.style.position = "relative";
    paragraph.style.top = `${offsets[index] ?? 0}px`;
    height += pitch;
  }
  root.style.minHeight = `${height || fontSize * scale * TEXT_RUN_LINE_HEIGHT}px`;
  return baseline;
}
