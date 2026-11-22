import type { FieldSummary } from "@pdf-editor/core";

type FieldState = Pick<FieldSummary, "name" | "required" | "filled">;

/**
 * Counts required fields and optional fields with answers.
 * @param fields The fields in the document.
 * @returns The completed count and the number still required.
 */
export function fieldProgress(fields: readonly FieldState[]) {
  const done = fields.filter((field) => field.filled).length;
  const remaining = fields.filter(needsAnswer).length;
  return { done, total: done + remaining, remaining };
}

/**
 * Picks the next unanswered required field, wrapping at the end of the document.
 * @param fields The fields in page order.
 * @param current The name of the last field visited, if any.
 * @returns The field to visit, or undefined when all required fields are filled.
 */
export function nextRequiredField<T extends FieldState>(fields: readonly T[], current?: string): T | undefined {
  const start = fields.findIndex((field) => field.name === current) + 1;
  return fields.slice(start).find(needsAnswer) ?? fields.slice(0, start).find(needsAnswer);
}

/**
 * @param field A summarized field.
 * @returns Whether the field still needs an answer.
 */
function needsAnswer(field: FieldState): boolean {
  return field.required && !field.filled;
}
