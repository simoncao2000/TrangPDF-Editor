import type { FormField } from "@pdf-editor/core";
import { useCallback, useLayoutEffect, useRef, type CSSProperties } from "react";
import { formBaselineOffset, formFontFace, formFontSize, scaleFormPoints } from "./form-text-layout";

type FormTextControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const METRIC_SIZE = 1000;

/**
 * Applies PDF form metrics and calibrates the browser's native control baseline to them.
 * @param widget The PDF widget being displayed.
 * @param zoom The page zoom, with one for 100 percent.
 * @param value The text that the control currently displays.
 * @returns The control ref and its text styles.
 */
export function useFormTextStyle(widget: FormField, zoom: number, value: string) {
  const control = useRef<FormTextControl | null>(null);
  const ref = useCallback((node: FormTextControl | null) => {
    control.current = node;
  }, []);
  const canvas = useRef<CanvasRenderingContext2D | null>(null);
  const { family, weight, style, ascent, descent } = formFontFace(widget.fontName);
  const { r, g, b } = widget.textColor;
  const inset = scaleFormPoints(widget.textInset, zoom);
  const autoText = widget.fontSize === 0 && !widget.multiline ? value : "";

  useLayoutEffect(() => {
    const node = control.current;
    if (!node) return;
    canvas.current ??= document.createElement("canvas").getContext("2d");
    const context = canvas.current;
    if (!context) return;

    context.font = `${style} ${weight} ${METRIC_SIZE}px ${family}`;
    context.fontKerning = "none";
    const metrics = context.measureText(autoText || "M");
    const size = scaleFormPoints(
      formFontSize(widget, { family, weight, style, ascent, descent }, autoText ? metrics.width / METRIC_SIZE : 0),
      zoom,
    );
    const browser = {
      ascent: metrics.fontBoundingBoxAscent / METRIC_SIZE,
      descent: metrics.fontBoundingBoxDescent / METRIC_SIZE,
    };
    const offset = formBaselineOffset({ ascent, descent }, browser) * size;
    node.style.setProperty("--form-font-size", `${size}px`);
    if (!Number.isFinite(offset)) return;
    const start = widget.multiline ? Math.max(0, inset + offset) : inset + 2 * Math.max(0, offset);
    const end = widget.multiline ? inset : inset + 2 * Math.max(0, -offset);
    node.style.setProperty("--form-padding-top", `${start}px`);
    node.style.setProperty("--form-padding-bottom", `${end}px`);
  }, [widget, zoom, autoText, family, weight, style, ascent, descent, inset]);

  const typography = {
    fontFamily: family,
    fontWeight: weight,
    fontStyle: style,
    lineHeight: ascent + descent,
    "--form-inset": `${inset}px`,
    "--form-text-color": `rgb(${r} ${g} ${b})`,
    "--form-default-font-size": `${scaleFormPoints(formFontSize(widget, { family, weight, style, ascent, descent }), zoom)}px`,
  } as CSSProperties;
  return { ref, typography };
}
