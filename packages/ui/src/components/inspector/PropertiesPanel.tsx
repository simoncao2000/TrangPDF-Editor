import { ImagePicker } from "../images/ImagePicker";
import { SignatureList } from "../signatures/SignatureList";
import { annotationRevisionOf, editAnnotation, isEditable, type EditableAnnotation } from "@pdf-editor/core";
import { useDocument, useEditorServices } from "../../editor/hooks";
import {
  isDrawingTool,
  SWATCHES,
  useAnnotationUi,
  type DrawingTool,
  type SelectedAnnotation,
  type ToolStyle,
} from "../../state/annotation-store";
import { ANNOTATION_NAMES } from "../annotations/annotation-display";
import { usePageAnnotations } from "../annotations/use-page-annotations";
import { ColorSwatches } from "../primitives/ColorSwatches";
import { PaperBoat } from "../primitives/PaperBoat";
import { RangeField } from "../primitives/RangeField";
import { TextProperties } from "../text-format/TextProperties";
import { useHasTextDraft } from "../text-format/use-text-style";

const TOOL_NAMES: Record<DrawingTool, string> = {
  note: "Note",
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "Strikethrough",
  squiggly: "Squiggly",
  ink: "Draw",
  square: "Rectangle",
  circle: "Ellipse",
  line: "Line",
  arrow: "Arrow",
  textBox: "Text",
  sign: "Sign",
  image: "Image",
};
const TOOL_HINTS: Record<DrawingTool, string> = {
  note: "Click on the page to stick a note there, then write in it.",
  highlight: "Drag across text to highlight it.",
  underline: "Drag across text to underline it.",
  strikeout: "Drag across text to strike it through.",
  squiggly: "Drag across text to put a squiggly line under it.",
  ink: "Drag on the page to draw. Each stroke is its own drawing.",
  square: "Drag on the page to draw a rectangle.",
  circle: "Drag on the page to draw an ellipse.",
  line: "Drag on the page to draw a line.",
  arrow: "Drag from where the arrow starts to where it points.",
  sign: "Click on the page to place your signature, then drag its corners to size it.",
  image: "Choose a picture, then drag a box on the page for it, or click to place it at its own size.",
  textBox:
    "Click on the page and type. The text becomes part of the page, like its other text: change it later with Edit text. Enter starts a new line; click away to finish.",
};

/** The style fields a kind of annotation has. */
type StyleField = "color" | "opacity" | "lineWidth" | "fontSize";
const FIELDS: Record<EditableAnnotation["kind"], readonly StyleField[]> = {
  note: ["color"],
  highlight: ["color", "opacity"],
  underline: ["color", "opacity"],
  strikeout: ["color", "opacity"],
  squiggly: ["color", "opacity"],
  ink: ["color", "opacity", "lineWidth"],
  square: ["color", "opacity", "lineWidth"],
  circle: ["color", "opacity", "lineWidth"],
  line: ["color", "opacity", "lineWidth"],
  arrow: ["color", "opacity", "lineWidth"],
  image: [],
  textBox: ["color", "opacity", "fontSize"],
};

/** The style fields shown in the inspector for each tool. */
const TOOL_FIELDS: Record<DrawingTool, readonly StyleField[]> = {
  ...FIELDS,
  textBox: [],
  sign: ["color", "lineWidth"],
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
const points = (value: number) => `${value} pt`;

/**
 * The Properties section of the inspector: the selected annotation's style, or the style the tool
 * in hand will use, or a hint when there is neither.
 * @param props Whether to hide the panel's heading.
 * @returns The panel's content.
 */
export function PropertiesPanel({ hideHeading = false }: { readonly hideHeading?: boolean } = {}) {
  const selected = useAnnotationUi((state) => state.selected);
  const tool = useAnnotationUi((state) => state.tool);
  const hasDraft = useHasTextDraft();
  if (hasDraft) return <TextProperties hideHeading={hideHeading} />;
  if (selected) return <SelectedProperties selected={selected} hideHeading={hideHeading} />;
  if (tool === "textBox") return <TextProperties hideHeading={hideHeading} />;
  if (isDrawingTool(tool)) return <ToolProperties tool={tool} hideHeading={hideHeading} />;
  if (tool === "editText") {
    return (
      <section className="grid gap-1" aria-labelledby={hideHeading ? undefined : "edit-text-title"}>
        {!hideHeading && (
          <h3 id="edit-text-title" className="font-hand text-xl">
            Edit text
          </h3>
        )}
        <p className="text-sm text-muted">
          Click any outlined text on the page to change it. Enter keeps the change; Esc cancels. If the original font
          lacks a letter you type, the line uses the closest standard font.
        </p>
      </section>
    );
  }
  return (
    <div className="grid justify-items-center gap-2 rounded-sm border border-divider p-5 text-center">
      <PaperBoat className="w-16" />
      <p className="font-semibold">Nothing selected</p>
      <p className="text-sm text-muted">Pick a tool, or click a mark on the page to change its colour and size.</p>
    </div>
  );
}

/**
 * Style controls for the tool in hand. Changes apply to the next annotation it makes.
 * @param props The tool and whether to hide its heading.
 * @returns The tool's controls.
 */
function ToolProperties({ tool, hideHeading }: { readonly tool: DrawingTool; readonly hideHeading: boolean }) {
  const style = useAnnotationUi((state) => state.styles[tool]);
  const setStyle = useAnnotationUi((state) => state.setStyle);
  return (
    <section className="grid gap-4" aria-labelledby={hideHeading ? undefined : "tool-properties-title"}>
      <div className="grid gap-1">
        {!hideHeading && (
          <h3 id="tool-properties-title" className="font-hand text-xl">
            {TOOL_NAMES[tool]} tool
          </h3>
        )}
        <p className="text-sm text-muted">{TOOL_HINTS[tool]}</p>
      </div>
      {tool === "sign" && <SignatureList />}
      {tool === "image" && <ImagePicker />}
      <StyleControls fields={TOOL_FIELDS[tool]} style={style} onChange={(patch) => setStyle(tool, patch)} />
    </section>
  );
}

/**
 * Style controls for the selected annotation. Each change is one undoable edit.
 * @param props The selection and whether to hide its heading.
 * @returns Its controls, or a note when it cannot be changed.
 */
function SelectedProperties({
  selected,
  hideHeading,
}: {
  readonly selected: SelectedAnnotation;
  readonly hideHeading: boolean;
}) {
  const { session } = useEditorServices();
  const revision = useDocument((state) => annotationRevisionOf(state, selected.pageId));
  const annotation = usePageAnnotations(selected.pageId, revision).find((candidate) => candidate.id === selected.id);
  if (!annotation) return null;

  const title = !hideHeading && (
    <h3 id="selected-properties-title" className="font-hand text-xl">
      {ANNOTATION_NAMES[annotation.kind]}
    </h3>
  );
  if (!isEditable(annotation)) {
    return (
      <section className="grid gap-1" aria-labelledby={hideHeading ? undefined : "selected-properties-title"}>
        {title}
        <p className="text-sm text-muted">Made in another app. You can delete it, but not change it here.</p>
      </section>
    );
  }

  const change = (patch: Partial<ToolStyle>) => {
    const after = { ...annotation, ...patch } as EditableAnnotation;
    session.dispatch((content) => editAnnotation(content, selected.pageId, annotation, after));
  };
  const style: ToolStyle = {
    color: annotation.color,
    opacity: annotation.opacity,
    lineWidth: "lineWidth" in annotation ? annotation.lineWidth : 1,
    fontSize: "fontSize" in annotation ? annotation.fontSize : 14,
  };
  return (
    <section className="grid gap-4" aria-labelledby={hideHeading ? undefined : "selected-properties-title"}>
      {title}
      <StyleControls fields={FIELDS[annotation.kind]} style={style} onChange={change} />
    </section>
  );
}

interface StyleControlsProps {
  readonly fields: readonly StyleField[];
  readonly style: ToolStyle;
  onChange(patch: Partial<ToolStyle>): void;
}

/**
 * The colour, opacity, line width and font size controls a style has.
 * @param props Which fields to show, the current style and the change callback.
 * @returns The controls.
 */
function StyleControls({ fields, style, onChange }: StyleControlsProps) {
  return (
    <>
      {fields.includes("color") && (
        <div className="grid gap-2">
          <span className="text-xs font-semibold text-muted">Colour</span>
          <ColorSwatches
            label="Colour"
            swatches={SWATCHES}
            value={style.color}
            onChange={(color) => onChange({ color })}
          />
        </div>
      )}
      {fields.includes("opacity") && (
        <RangeField
          label="Opacity"
          value={style.opacity}
          min={0.1}
          max={1}
          step={0.05}
          format={percent}
          onCommit={(opacity) => onChange({ opacity })}
        />
      )}
      {fields.includes("lineWidth") && (
        <RangeField
          label="Line width"
          value={style.lineWidth}
          min={0.5}
          max={12}
          step={0.5}
          format={points}
          onCommit={(lineWidth) => onChange({ lineWidth })}
        />
      )}
      {fields.includes("fontSize") && (
        <RangeField
          label="Font size"
          value={style.fontSize}
          min={8}
          max={48}
          step={1}
          format={points}
          onCommit={(fontSize) => onChange({ fontSize })}
        />
      )}
    </>
  );
}
