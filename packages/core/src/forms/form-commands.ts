/** Filling in a form field, undoably. PDFium holds field values, so the page gets a new revision. */
import type { Command } from "../document/commands";
import type { DocumentContent } from "../document/document-state";
import { pageEditCommand } from "../document/page-edit-command";
import type { FormField } from "./form-field";

/**
 * Sets a field's value through one of its widgets. For a checkbox or radio button, the value is
 * the widget's export value to check it, or "Off" to clear it.
 * @param content The current content.
 * @param pageId The page the widget is on.
 * @param widget The widget, as read before the change.
 * @param value The new value.
 * @returns The command.
 */
export function setFieldValue(content: DocumentContent, pageId: string, widget: FormField, value: string): Command {
  const before = widget.value;
  return pageEditCommand(content, pageId, `Fill ${widget.name}`, {
    apply: (engine, at) => engine("setFormField", { ...at, id: widget.id, value }),
    undo: (engine, at) => engine("setFormField", { ...at, id: widget.id, value: before }),
  });
}
