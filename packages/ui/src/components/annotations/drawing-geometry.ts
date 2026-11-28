/**
 * Screen-space helpers for the drawing tools. Pure, so they are easy to test.
 */
import {
  CSS_PIXELS_PER_POINT,
  screenToPdf,
  type NewTextLine,
  type PageFrame,
  type ScreenPoint,
  type ScreenRect,
} from "@pdf-editor/core";

import type { DrawingTool } from "../../state/annotation-store";

/** Ink points closer than this to the previous one are dropped, in CSS pixels. */
export const MIN_STROKE_STEP = 1.5;
/** Line height of new text, as a multiple of the font size (the editor uses the same). */
export const LINE_HEIGHT = 1.15;
/**
 * Distance from the top of a line to its baseline, as a multiple of the font size: half the extra
 * line height plus Helvetica/Arial's ascent (0.905).
 */
const FIRST_BASELINE = (LINE_HEIGHT - 1.117) / 2 + 0.905;
/** A drag shorter than this is treated as a click, in CSS pixels. */
export const CLICK_SLOP = 4;
/** Minimum total travel, in screen pixels, for a stroke or shape gesture to count. */
export const MIN_GESTURE_TRAVEL = 3;

/** Whether a gesture reaches the minimum screen-space travel.
 * @param points Pointer positions from the gesture.
 * @returns True when at least two points reach the threshold from the first point.
 */
export function hasGestureTravel(points: readonly ScreenPoint[]): boolean {
  if (points.length < 2) return false;
  const first = points[0]!;
  return points.some((point) => Math.hypot(point.x - first.x, point.y - first.y) >= MIN_GESTURE_TRAVEL);
}

/** Decides whether a stroke or drag is too short for the active tool.
 * @param tool The active drawing tool.
 * @param points Screen positions recorded during the gesture.
 * @returns True when a drag-drawn tool received less than its minimum travel.
 */
export function shouldDiscardGesture(tool: DrawingTool, points: readonly ScreenPoint[]): boolean {
  const requiresTravel =
    tool === "ink" || tool === "line" || tool === "arrow" || tool === "square" || tool === "circle";
  return requiresTravel && !hasGestureTravel(points);
}

/**
 * The rectangle between two corners, whichever way it was dragged.
 * @param a Where the drag started.
 * @param b Where it is now.
 * @returns The rectangle.
 */
export function rectBetween(a: ScreenPoint, b: ScreenPoint): ScreenRect {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/**
 * Where each line of new page text goes, from where the user clicked: each line's baseline start
 * in PDF space, matching how the editor showed the text (Helvetica-like, line height 1.15).
 * @param text The typed text; empty lines keep their space but make no text.
 * @param at The click, the top-left of the text, in screen pixels.
 * @param fontSize Font size in points.
 * @param frame How the page is shown.
 * @returns The lines with their baselines, and the angle that keeps the text upright on screen.
 */
export function newTextLines(
  text: string,
  at: ScreenPoint,
  fontSize: number,
  frame: PageFrame,
): { lines: NewTextLine[]; angle: number } {
  const scale = frame.zoom * CSS_PIXELS_PER_POINT;
  const lines = text.split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    const baseline = { x: at.x, y: at.y + (FIRST_BASELINE + LINE_HEIGHT * index) * fontSize * scale };
    return [{ text: line, origin: screenToPdf(baseline, frame) }];
  });
  // The page is shown turned clockwise by `rotation`; turning the text the other way keeps it upright.
  return { lines, angle: frame.rotation };
}

/**
 * Adds a point to a stroke unless it is too close to the last one.
 * @param stroke The stroke so far.
 * @param point The new pointer position.
 * @returns The stroke, with the point if it was far enough.
 */
export function extendStroke(stroke: readonly ScreenPoint[], point: ScreenPoint): readonly ScreenPoint[] {
  const last = stroke.at(-1);
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_STROKE_STEP) return stroke;
  return [...stroke, point];
}
