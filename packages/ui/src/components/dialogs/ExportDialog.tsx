import { FileOutput, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { baseName, describePages } from "../../editor/file-names";
import { useDocument, useEditorServices } from "../../editor/hooks";
import { useDocumentActions } from "../../editor/use-document-actions";
import { useExport, type BlockedExport, type ExportScope } from "../../editor/use-export";
import { useMediaQuery, WIDE_LAYOUT_QUERY } from "../../hooks/use-media-query";
import { useViewMode } from "../../routing/hooks";
import { useLayout } from "../../state/layout-store";
import { useViewer } from "../../state/viewer-store";
import { FieldsPanel } from "../forms/FieldsPanel";
import { useDocumentFields } from "../forms/use-document-fields";
import { useFieldNavigation } from "../forms/use-field-navigation";
import { Inspector } from "../inspector/Inspector";
import { Button } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";

/**
 * Export a copy: which pages, under what name, and whether annotations are flattened into the
 * pages (for sending: highlights and comments become part of the page and can't be edited).
 * @returns The dialog while an export is being set up, otherwise nothing.
 */
export function ExportDialog() {
  const { session } = useEditorServices();
  const { request, check, close } = useExport();

  useEffect(() => {
    if (request?.stage === "requested") void check(request, session);
    else if (request && request.session !== session) close();
  }, [request, session, check, close]);

  if (!request || request.stage === "requested" || request.session !== session) return null;
  if (request.stage === "blocked") return <ExportReview request={request} />;
  return request.stage === "ready" ? <ExportForm key={request.scope} initialScope={request.scope} /> : null;
}

/**
 * Reveals the missing fields without taking focus away from the page.
 * @param props The blocked export and its first missing field.
 * @returns The validation message and field controls when the side rail is unavailable.
 */
function ExportReview({ request }: { readonly request: BlockedExport }) {
  // The workbench's Inspector rail is available from 1200px.
  const narrow = !useMediaQuery(WIDE_LAYOUT_QUERY);
  const hasRail = useMediaQuery("(min-width: 1200px)");
  const { open } = useFieldNavigation();
  const { close, exportAnyway } = useExport();
  const { setMode } = useViewMode();
  const focusFirst = useEffectEvent(() => open(request.first));

  useEffect(() => {
    setMode("read");
    const layout = useLayout.getState();
    if (hasRail && !layout.propertiesOpen) layout.toggleProperties();
    const frame = requestAnimationFrame(() => focusFirst());
    return () => cancelAnimationFrame(frame);
  }, [request, hasRail, setMode]);

  return (
    <div
      className={`pointer-events-none fixed z-40 grid justify-items-center gap-2 ${
        narrow
          ? "inset-x-3 bottom-[calc(136px+max(0px,env(safe-area-inset-bottom)-4px))] mx-auto max-w-136"
          : "inset-x-2 bottom-16 min-[1200px]:bottom-20"
      }`}
    >
      <div className="pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-sm bg-inverse px-3 py-1.5 text-sm text-on-inverse shadow-3">
        <TriangleAlert className="size-4.5 shrink-0" aria-hidden="true" />
        <p role="alert" className="min-w-0 flex-1 wrap-anywhere">
          {request.first.name.trim() || "An unnamed field"} is required
        </p>
        <button
          type="button"
          onClick={() => exportAnyway(request)}
          className={`shrink-0 rounded-xs px-2 font-semibold hover:bg-on-inverse/15 ${narrow ? "min-h-11" : "min-h-8"}`}
        >
          Export anyway
        </button>
        <button
          type="button"
          aria-label="Dismiss export review"
          onClick={close}
          className={`grid shrink-0 place-items-center rounded-xs hover:bg-on-inverse/15 ${
            narrow ? "size-11" : "size-8"
          }`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {narrow && <PhoneReviewFields />}
      {!narrow && !hasRail && (
        <div className="pointer-events-auto w-full max-w-120 overflow-hidden rounded-xs border border-line shadow-3 [&>aside]:max-h-[26dvh]">
          <Inspector />
        </div>
      )}
    </div>
  );
}

/**
 * Shows the form fields below the phone's export warning.
 * @returns The scrollable Fields card.
 */
function PhoneReviewFields() {
  const { fields, message } = useDocumentFields();
  return (
    <div className="pointer-events-auto max-h-[30dvh] w-full overflow-y-auto rounded-xs border border-line bg-raised px-4 py-3 shadow-3">
      {message ? <p role="status">{message}</p> : <FieldsPanel fields={fields} validate />}
    </div>
  );
}

/**
 * The dialog's form.
 * @param props Which pages to suggest first.
 * @param props.initialScope All pages, the current page, or the selected pages.
 * @returns The dialog.
 */
function ExportForm({ initialScope }: { readonly initialScope: ExportScope }) {
  const close = useExport((state) => state.close);
  const actions = useDocumentActions();
  const pages = useDocument((state) => state.pages);
  const selection = useDocument((state) => state.selection);
  const fileName = useDocument((state) => state.fileName);
  const current = useViewer((state) => state.currentPage);
  const [scope, setScope] = useState<ExportScope>(
    initialScope === "selected" && selection.length === 0 ? "all" : initialScope,
  );
  const [flatten, setFlatten] = useState(false);

  const numbers = (ids: readonly string[]) =>
    pages.flatMap((page, index) => (ids.includes(page.id) ? [index + 1] : []));
  const choices: { scope: ExportScope; label: string; ids: string[] }[] = [
    {
      scope: "all",
      label: `All ${pages.length === 1 ? "1 page" : `${pages.length} pages`}`,
      ids: pages.map((p) => p.id),
    },
    { scope: "current", label: `Current page (${current + 1})`, ids: pages[current] ? [pages[current].id] : [] },
    ...(selection.length > 0
      ? [{ scope: "selected" as const, label: `Selected: ${describePages(numbers(selection))}`, ids: [...selection] }]
      : []),
  ];
  const chosen = choices.find((choice) => choice.scope === scope) ?? choices[0]!;
  const suggested = `${baseName(fileName ?? "Document")}${scope === "all" ? " (copy)" : ` (${describePages(numbers(chosen.ids))})`}.pdf`;
  const [name, setName] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    close();
    void actions.extract(chosen.ids, { name: (name ?? suggested).trim() || suggested, flatten });
  };

  return (
    <Dialog
      title="Export a copy"
      icon={FileOutput}
      onDismiss={close}
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit" form="export-form">
            Export
          </Button>
        </>
      }
    >
      <form id="export-form" className="grid gap-4" onSubmit={submit}>
        <label className="grid gap-1.5 text-sm">
          File name
          <input
            value={name ?? suggested}
            onChange={(event) => setName(event.target.value)}
            className="h-9 rounded-sm border border-line bg-surface px-2.5 text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </label>
        <fieldset className="grid gap-1.5 text-sm">
          <legend className="mb-1.5">Pages</legend>
          {choices.map((choice) => (
            <label key={choice.scope} className="flex items-center gap-2">
              <input
                type="radio"
                name="export-pages"
                checked={choice.scope === scope}
                onChange={() => setScope(choice.scope)}
                className="accent-(--color-action)"
              />
              {choice.label}
            </label>
          ))}
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={flatten}
            onChange={(event) => setFlatten(event.target.checked)}
            className="mt-0.5 accent-(--color-action)"
          />
          <span className="grid gap-0.5">
            Flatten annotations
            <span className="text-xs text-muted">
              Highlights and comments become part of the page and can’t be edited.
            </span>
          </span>
        </label>
      </form>
    </Dialog>
  );
}
