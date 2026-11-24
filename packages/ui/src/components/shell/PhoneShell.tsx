import { useDocument } from "../../editor/hooks";
import { useOpenPanel, useViewMode } from "../../routing/hooks";
import { useViewer } from "../../state/viewer-store";
import { CommentsPanel } from "../comments/CommentsPanel";
import { useDocumentThreads } from "../comments/use-document-threads";
import { fieldProgress } from "../forms/field-progress";
import { FieldsPanel } from "../forms/FieldsPanel";
import { useDocumentFields, type DocumentField } from "../forms/use-document-fields";
import { useFieldNavigation } from "../forms/use-field-navigation";
import { PropertiesPanel } from "../inspector/PropertiesPanel";
import { OrganizeView } from "../organize/OrganizeView";
import { Sheet } from "../primitives/Sheet";
import { PageViewport } from "../viewer/PageViewport";
import { FilesSheet } from "./phone/FilesSheet";
import { MoreSheet } from "./phone/MoreSheet";
import { PanelTabs } from "./phone/PanelTabs";
import { PhoneTopBar } from "./phone/PhoneTopBar";
import { PhoneTools } from "./PhoneTools";

interface PhoneShellProps {
  /** False while a dialog is open, so shortcuts do not fire behind it. */
  readonly keysEnabled: boolean;
}

/**
 * Shows the phone editor, floating tools and URL-backed panels.
 * @param props Whether keyboard shortcuts are on.
 * @returns The phone layout.
 */
export function PhoneShell({ keysEnabled }: PhoneShellProps) {
  const status = useDocument((state) => state.status);
  const fileName = useDocument((state) => state.fileName);
  const pageCount = useDocument((state) => state.pages.length);
  const currentPage = useViewer((state) => state.currentPage);
  const { mode, setMode } = useViewMode();
  const { panel, closePanel } = useOpenPanel();
  const { threads, count } = useDocumentThreads(panel === "comments");
  const fields = useDocumentFields();
  const progress = fieldProgress(fields);
  const { open } = useFieldNavigation();
  const ready = status === "clean" || status === "dirty" || status === "saving";

  /**
   * Returns to the document before navigating to a field.
   * @param field The field to visit.
   * @returns Nothing.
   */
  function visitField(field: DocumentField) {
    closePanel(() => {
      setMode("read");
      open(field);
    });
  }

  return (
    <>
      <PhoneTopBar />
      <div className="relative grid min-h-0 min-w-0 bg-canvas">
        {ready && mode === "organize" ? (
          <OrganizeView narrow />
        ) : ready ? (
          <PageViewport narrow />
        ) : (
          <p className="grid place-items-center font-hand text-xl text-muted">Opening {fileName}…</p>
        )}
        {ready && mode !== "organize" && pageCount > 0 && (
          <span
            aria-label={`Page ${currentPage + 1} of ${pageCount}`}
            className="pointer-events-none absolute top-3 right-3 z-2 rounded-pill bg-raised/92 px-2.5 py-1 text-xs leading-[1.3] text-muted tabular-nums shadow-1 ring-1 ring-line"
          >
            {currentPage + 1} / {pageCount}
          </span>
        )}
        {ready && <PhoneTools keysEnabled={keysEnabled && !panel} showTray={!panel} />}
      </div>
      <PanelTabs threadCount={count} progress={progress} />

      {panel === "files" && <FilesSheet onClose={closePanel} />}
      {panel === "more" && <MoreSheet />}
      {panel === "comments" && (
        <Sheet title={count === 0 ? "Comments" : `Comments · ${count}`} onDismiss={closePanel}>
          <CommentsPanel threads={threads} />
        </Sheet>
      )}
      {panel === "fields" && (
        <Sheet title="Fields" meta={`${progress.done} of ${progress.total} done`} onDismiss={closePanel}>
          <FieldsPanel fields={fields} validate={false} headingHidden onOpenField={visitField} />
        </Sheet>
      )}
      {panel === "properties" && (
        <Sheet title="Properties" onDismiss={closePanel}>
          <div className="px-2">
            <PropertiesPanel />
          </div>
        </Sheet>
      )}
    </>
  );
}
