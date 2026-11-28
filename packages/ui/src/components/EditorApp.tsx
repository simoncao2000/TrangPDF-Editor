import { useEffect } from "react";
import { useStore } from "zustand";
import { useDocument, useEditorServices } from "../editor/hooks";
import { useLeaveGuard } from "../editor/leave-guard";
import { useDocumentActions } from "../editor/use-document-actions";
import { useFileError, useFileOpener } from "../editor/use-file-opener";
import { useMediaQuery, WIDE_LAYOUT_QUERY } from "../hooks/use-media-query";
import { useShortcuts } from "../hooks/use-shortcut";
import { useCopySelection } from "./page-text/use-copy-selection";
import { useWindowFileDrop } from "../hooks/use-window-file-drop";
import { useAnnotationUi } from "../state/annotation-store";
import { useViewSearch } from "../routing/router";
import { useViewUrl } from "../routing/use-view-url";
import { useToast } from "../state/toast-store";
import { OpenErrorDialog } from "./dialogs/OpenErrorDialog";
import { PasswordDialog } from "./dialogs/PasswordDialog";
import { ExportDialog } from "./dialogs/ExportDialog";
import { SignaturePadDialog } from "./signatures/SignaturePadDialog";
import { UnsavedChangesDialog } from "./dialogs/UnsavedChangesDialog";
import { InsertPagesFlow } from "./organize/InsertPagesFlow";
import { CommandPalette } from "./palette/CommandPalette";
import { Toaster } from "./primitives/Toaster";
import { StartScreen } from "./start/StartScreen";
import { ViewerScreen } from "./viewer/ViewerScreen";

/**
 * The editor's root: picks the screen from the document status (architecture §6.3) and owns the
 * window-wide behaviours: drop a file anywhere, the global shortcuts, toasts, and the warning before
 * leaving with unsaved changes.
 * @returns The current screen and any open dialog.
 */
export function EditorApp() {
  useCopySelection();
  useViewUrl();
  const { workspace, files } = useEditorServices();
  const { openFromPicker, openFromDrop } = useFileOpener();
  const actions = useDocumentActions();
  const status = useDocument((state) => state.status);
  const documentError = useDocument((state) => state.error);
  const fileName = useDocument((state) => state.fileName);
  const fileError = useFileError((state) => state.error);
  const clearFileError = useFileError((state) => state.set);
  const leaving = useLeaveGuard((state) => state.pending !== null);
  const dismissToast = useToast((state) => state.dismiss);
  const showToast = useToast((state) => state.show);
  const failedEdit = useDocument((state) => state.failedEdit);
  const selectAnnotation = useAnnotationUi((state) => state.select);
  const narrow = !useMediaQuery(WIDE_LAYOUT_QUERY);
  const hasTabs = useStore(workspace.store, (state) => state.tabs.length > 0);

  const { panel } = useViewSearch();
  const paletteOpen = hasTabs && panel === "search";
  const modalOpen = status === "needsPassword" || status === "failed" || fileError !== null || leaving || paletteOpen;
  const editable = status === "clean" || status === "dirty";
  const dragging = useWindowFileDrop(openFromDrop, !modalOpen);

  useShortcuts(
    [
      [{ key: "o", mod: true }, () => void openFromPicker()],
      [{ key: "z", mod: true }, () => editable && actions.undo()],
      [{ key: "z", mod: true, shift: true }, () => editable && actions.redo()],
      [{ key: "y", mod: true }, () => editable && actions.redo()],
      // Without saving in place (Firefox, Safari) Save downloads a copy, like the Download button.
      [
        { key: "s", mod: true },
        () => (files.canSaveInPlace ? status === "dirty" && void actions.save() : editable && void actions.saveAs()),
      ],
      [{ key: "s", mod: true, shift: true }, () => editable && void actions.saveAs()],
    ],
    !modalOpen,
  );

  // Toast actions and annotation selection belong to the document they were shown for.
  useEffect(() => {
    if (status === "loading" || status === "empty") {
      dismissToast();
      selectAnnotation(null);
    }
  }, [status, dismissToast, selectAnnotation]);

  // An edit PDFium refused (rare: a damaged annotation, out of memory).
  useEffect(() => {
    if (failedEdit) showToast(`Couldn’t finish: ${failedEdit.label.toLowerCase()}.`, { tone: "error" });
  }, [failedEdit, showToast]);

  // The browser asks before closing the window while any open document has unsaved changes.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => workspace.hasUnsavedChanges() && event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [workspace]);

  const showViewer = status === "loading" || status === "clean" || status === "dirty" || status === "saving";
  const failedKind =
    status === "failed" && documentError && documentError !== "password-required" && documentError !== "wrong-password"
      ? documentError
      : null;

  return (
    <>
      {hasTabs && (showViewer || status === "needsPassword" || status === "failed") ? (
        <ViewerScreen narrow={narrow} dragging={dragging} keysEnabled={!modalOpen} />
      ) : (
        <StartScreen dragging={dragging} />
      )}
      {status === "needsPassword" && <PasswordDialog />}
      {failedKind && <OpenErrorDialog kind={failedKind} fileName={fileName} onClose={() => actions.closeTab()} />}
      {fileError && fileError.kind !== "password-required" && fileError.kind !== "wrong-password" && (
        <OpenErrorDialog kind={fileError.kind} fileName={fileError.fileName} onClose={() => clearFileError(null)} />
      )}
      {hasTabs && <CommandPalette />}
      <InsertPagesFlow />
      <ExportDialog />
      <SignaturePadDialog />
      <UnsavedChangesDialog />
      <Toaster />
    </>
  );
}
