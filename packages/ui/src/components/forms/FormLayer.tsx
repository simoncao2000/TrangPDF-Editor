import {
  annotationRevisionOf,
  pageFrame,
  pdfRectToScreen,
  setFieldValue,
  type FormField,
  type PageFrame,
} from "@pdf-editor/core";
import { useState, type CSSProperties } from "react";
import { useEditorServices } from "../../editor/hooks";
import { useAnnotationUi } from "../../state/annotation-store";
import { usePageFormFields } from "../annotations/use-page-annotations";
import type { PageDrawInfo } from "../viewer/use-page-geometry";
import { FormChoice } from "./FormChoice";
import { FormText } from "./FormText";
import { FormToggle } from "./FormToggle";

interface FormLayerProps {
  readonly page: PageDrawInfo;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

export interface FormControlProps {
  readonly widget: FormField;
  readonly commit: (value: string) => void;
}

export interface FormTypographyProps extends FormControlProps {
  readonly zoom: number;
}

interface PendingFields {
  readonly source: readonly FormField[];
  readonly revision: number;
  readonly values: ReadonlyMap<string, string>;
}

interface FormWidgetProps extends FormControlProps {
  readonly frame: PageFrame;
  readonly pageId: string;
}

/**
 * Positions and rotates an HTML control over its widget's page rectangle.
 * @param props The widget, page frame and commit handler.
 * @returns The overlay for a supported widget.
 */
function FormWidget({ widget, frame, pageId, commit }: FormWidgetProps) {
  if (widget.kind === "button" || widget.kind === "signature") return null;

  const { left, top, width, height } = pdfRectToScreen(widget.rect, frame);
  const sideways = frame.rotation % 180 !== 0;
  const fieldHeight = sideways ? width : height;
  const style = {
    left: left + width / 2,
    top: top + height / 2,
    width: sideways ? height : width,
    height: fieldHeight,
    transform: `translate(-50%, -50%) rotate(${frame.rotation}deg)`,
  } as CSSProperties;

  return (
    <div className="absolute focus-within:z-1" style={style}>
      {widget.kind === "text" && <FormText widget={widget} commit={commit} zoom={frame.zoom} />}
      {widget.kind === "choice" && <FormChoice widget={widget} commit={commit} zoom={frame.zoom} />}
      {(widget.kind === "checkbox" || widget.kind === "radio") && (
        <FormToggle widget={widget} pageId={pageId} commit={commit} />
      )}
    </div>
  );
}

/**
 * Overlays one page's interactive PDF fields in annotation order.
 * @param props The page, zoom and on-screen page size.
 * @returns The page's form controls.
 */
export function FormLayer({ page, zoom, width, height }: FormLayerProps) {
  const { session } = useEditorServices();
  const fields = usePageFormFields(page.id, page.revision);
  const active = useAnnotationUi((state) => state.tool === "select");
  const [pending, setPending] = useState<PendingFields>();
  if (!fields.length) return null;

  const frame = pageFrame(page.sourceGeometry, page.rotation, zoom);
  const paperWidth = frame.rotation % 180 === 0 ? width : height;
  // Keep rapid edits based on the most recent commit while the engine read catches up.
  const values = pending?.source === fields && pending.revision === page.revision ? pending.values : undefined;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 [--form-border:max(1px,calc(0.3*var(--form-unit)))] [--form-ring-size:calc(0.8*var(--form-unit))] [--form-tint:color-mix(in_srgb,var(--paper-focus)_6%,var(--paper-field))] [&:not([inert])>*]:pointer-events-auto"
      inert={!active}
      style={{ "--form-unit": `${paperWidth / 100}px` } as CSSProperties}
    >
      {fields.map((field) => {
        const value = values?.get(field.name);
        const widget = value === undefined ? field : { ...field, value, checked: value === field.exportValue };
        return (
          <FormWidget
            key={widget.id}
            widget={widget}
            frame={frame}
            pageId={page.id}
            commit={(next) => {
              if (widget.readOnly || next === widget.value) return;
              session.dispatch((content) => setFieldValue(content, page.id, widget, next));
              const revision = annotationRevisionOf(session.store.getState(), page.id);
              if (revision !== page.revision) {
                setPending({ source: fields, revision, values: new Map(values).set(widget.name, next) });
              }
            }}
          />
        );
      })}
    </div>
  );
}
