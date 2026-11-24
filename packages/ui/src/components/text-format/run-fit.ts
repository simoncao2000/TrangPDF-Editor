import { FIT_RUN } from "./text-runs";

/**
 * Fits browser glyphs to a width from the PDF, including at fractional zoom levels.
 * @param original The target width in CSS pixels.
 * @param measured The browser width in CSS pixels.
 * @returns The horizontal scale, or one for an empty run.
 */
export function runFitRatio(original: number, measured: number): number {
  return original > 0 && measured > 0 ? original / measured : 1;
}

/** One source run measured in its browser face before editing. */
interface SourceMetrics {
  readonly width: number;
  readonly ratio: number;
}

/**
 * Measures source ink in the browser face, accounting for the side bearings at the ends of the line.
 * @param metrics Browser glyph measurements.
 * @param first Whether this piece starts the line.
 * @param last Whether this piece ends the line.
 * @returns The distance occupied between adjacent pieces or the outside edges of the ink.
 */
function inkWidth(metrics: TextMetrics, first: boolean, last: boolean): number {
  return (first ? metrics.actualBoundingBoxLeft : 0) + (last ? metrics.actualBoundingBoxRight : metrics.width);
}

/**
 * Measures the source line again when zoom or the loaded face changes.
 * @param ctx Browser text measurement context.
 * @param runs Source strings and their fully resolved CSS font descriptions.
 * @returns Browser metrics in CSS pixels for each original run.
 */
export function measureSource(
  ctx: CanvasRenderingContext2D,
  runs: readonly { text: string; font: string; originalWidth?: number }[],
  targetScale = 1,
) {
  return runs.map(({ text, font, originalWidth }, index): SourceMetrics => {
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const measured = inkWidth(metrics, index === 0, index === runs.length - 1);
    const width = originalWidth === undefined ? measured : originalWidth * targetScale;
    return {
      width,
      ratio: runFitRatio(width, measured),
    };
  });
}

/**
 * Fits the live DOM without writing presentation attributes back to the Lexical state.
 * @param root The editable line.
 * @param ctx Browser text measurement context.
 * @param source Browser metrics for the original runs.
 * @param width PDF line width at the current zoom.
 * @returns Nothing.
 */
export function fitEditorRuns(
  root: HTMLElement,
  ctx: CanvasRenderingContext2D,
  source: readonly SourceMetrics[],
  width: number,
): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-lexical-text]"));
  const pieces = elements.map((element, index) => {
    const css = getComputedStyle(element);
    ctx.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    const metrics = ctx.measureText(element.textContent ?? "");
    const first = index === 0;
    const last = index === elements.length - 1;
    const measured = inkWidth(metrics, first, last);
    const id = source.length === 1 ? 0 : Number.parseInt(element.style.getPropertyValue(FIT_RUN), 10);
    const previousId = elements
      .slice(0, index)
      .map((candidate) => Number.parseInt(candidate.style.getPropertyValue(FIT_RUN), 10))
      .filter((candidate) => Number.isInteger(candidate) && candidate >= 0)
      .at(-1);
    const nextId = elements
      .slice(index + 1)
      .map((candidate) => Number.parseInt(candidate.style.getPropertyValue(FIT_RUN), 10))
      .find((candidate) => Number.isInteger(candidate) && candidate >= 0);
    const nearest = previousId ?? nextId ?? 0;
    return { element, id, nearest, measured, metrics, first };
  });
  for (const { element, id, nearest, measured, metrics, first } of pieces) {
    const ratio = source[id]?.ratio ?? source[nearest]?.ratio ?? runFitRatio(width, measured);
    const left = first ? metrics.actualBoundingBoxLeft * ratio : 0;
    // A transform changes painting and selection rectangles, but the next run needs the fitted advance too.
    element.style.display = "inline-block";
    element.style.transformOrigin = "left center";
    element.style.transform = `scaleX(${ratio})`;
    element.style.marginLeft = `${left}px`;
    element.style.marginRight = `${measured * ratio - left - metrics.width}px`;
  }
}
