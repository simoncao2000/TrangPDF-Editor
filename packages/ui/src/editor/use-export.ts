import { summarizeFields, type DocumentSession, type FormField, type PageRef } from "@pdf-editor/core";
import { create } from "zustand";
import { nextRequiredField } from "../components/forms/field-progress";
import type { DocumentField } from "../components/forms/use-document-fields";

/** Which pages the dialog suggests first. */
export type ExportScope = "all" | "current" | "selected";

type ExportSession = Pick<DocumentSession, "store" | "readFormFields">;
type RequestedExport = { readonly stage: "requested"; readonly scope: ExportScope };
type SessionExport = { readonly scope: ExportScope; readonly session: ExportSession };
export type BlockedExport = SessionExport & { readonly stage: "blocked"; readonly first: DocumentField };

type ExportRequest = RequestedExport | (SessionExport & { readonly stage: "checking" | "ready" }) | BlockedExport;

interface ExportState {
  readonly request: ExportRequest | null;
  open(scope: ExportScope): void;
  check(request: RequestedExport, session: ExportSession): Promise<void>;
  exportAnyway(request: BlockedExport): void;
  close(): void;
}

export const useExport = create<ExportState>((set, get) => ({
  request: null,
  open: (scope) => set({ request: { stage: "requested", scope } }),
  check: async (request, session) => {
    if (get().request !== request) return;
    const checking = { stage: "checking", scope: request.scope, session } as const;
    set({ request: checking });

    while (get().request === checking) {
      const { pages, annotationRevisions } = session.store.getState();
      const first = await readFirstMissingField(session, pages);
      if (get().request !== checking) return;
      const latest = session.store.getState();
      if (latest.pages !== pages || latest.annotationRevisions !== annotationRevisions) continue;
      set({
        request: first
          ? { stage: "blocked", scope: request.scope, session, first }
          : { stage: "ready", scope: request.scope, session },
      });
      return;
    }
  },
  exportAnyway: (request) => {
    if (get().request === request) {
      set({ request: { stage: "ready", scope: request.scope, session: request.session } });
    }
  },
  close: () => set({ request: null }),
}));

/**
 * @param session The document being exported.
 * @param pages Its pages in document order.
 * @returns The first unanswered required field and its location, if any.
 */
async function readFirstMissingField(
  session: ExportSession,
  pages: readonly PageRef[],
): Promise<DocumentField | undefined> {
  const widgets = await Promise.all(
    pages.map(({ id }) => session.readFormFields(id).catch((): readonly FormField[] => [])),
  );
  const first = nextRequiredField(summarizeFields(widgets.flat()));
  if (!first) return undefined;
  const page = pages[widgets.findIndex((fields) => fields.includes(first.first))]!;
  return { ...first, pageId: page.id };
}
