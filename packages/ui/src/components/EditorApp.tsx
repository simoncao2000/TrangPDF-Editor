import { useEffect } from "react";
import { useDocument, useEditorServices } from "../editor/hooks";
import { useLeaveGuard } from "../editor/leave-guard";
import { useDocumentActions } from "../editor/use-document-actions";
import { useFileError, useFileOpener } from "../editor/use-file-opener";
import { useMediaQuery, WIDE_LAYOUT_QUERY } from "../hooks/use-media-query";
import { useShortcuts } from "../hooks/use-shortcut";
import { useWindowFileDrop } from "../hooks/use-window-file-drop";
import { useAnnotationUi } from "../state/annotation-store";
import { useToast } from "../state/toast-store";
import { useViewer } from "../state/viewer-store";
import { OpenErrorDialog } from "./dialogs/OpenErrorDialog";
import { PasswordDialog } from "./dialogs/PasswordDialog";
import { UnsavedChangesDialog } from "./dialogs/UnsavedChangesDialog";
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
  const { session } = useEditorServices();
  const { openFromPicker, openFromDrop } = useFileOpener();
  const actions = useDocumentActions();
  const status = useDocument((state) => state.status);
  const documentError = useDocument((state) => state.error);
  const fileName = useDocument((state) => state.fileName);
  const fileError = useFileError((state) => state.error);
  const clearFileError = useFileError((state) => state.set);
  const leaving = useLeaveGuard((state) => state.pending !== null);
  const resetViewer = useViewer((state) => state.reset);
  const dismissToast = useToast((state) => state.dismiss);
  const showToast = useToast((state) => state.show);
  const failedEdit = useDocument((state) => state.failedEdit);
  const selectAnnotation = useAnnotationUi((state) => state.select);
  const narrow = !useMediaQuery(WIDE_LAYOUT_QUERY);

  const modalOpen = status === "needsPassword" || status === "failed" || fileError !== null || leaving;
  const editable = status === "clean" || status === "dirty";
  const dragging = useWindowFileDrop(openFromDrop, !modalOpen);

  useShortcuts(
    [
      [{ key: "o", mod: true }, () => void openFromPicker()],
      [{ key: "z", mod: true }, () => editable && actions.undo()],
      [{ key: "z", mod: true, shift: true }, () => editable && actions.redo()],
      [{ key: "y", mod: true }, () => editable && actions.redo()],
      [{ key: "s", mod: true }, () => status === "dirty" && void actions.save()],
      [{ key: "s", mod: true, shift: true }, () => editable && void actions.saveAs()],
    ],
    !modalOpen,
  );

  // A new document starts at page 1, fit to width, in reading mode. A toast's Undo belongs to the
  // document it was shown for, so toasts go when a document closes or another one opens.
  useEffect(() => {
    if (status === "loading") resetViewer();
    if (status === "loading" || status === "empty") {
      dismissToast();
      selectAnnotation(null);
    }
  }, [status, resetViewer, dismissToast, selectAnnotation]);

  // An edit PDFium refused (rare: a damaged annotation, out of memory).
  useEffect(() => {
    if (failedEdit) showToast(`Couldn’t finish: ${failedEdit.label.toLowerCase()}.`, { tone: "error" });
  }, [failedEdit, showToast]);

  // The browser asks before closing the tab while there are unsaved changes.
  useEffect(() => {
    if (status !== "dirty" && status !== "saving") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const showViewer = status === "loading" || status === "clean" || status === "dirty" || status === "saving";
  const failedKind = status === "failed" && documentError && documentError !== "password-required" && documentError !== "wrong-password" ? documentError : null;

  return (
    <>
      {showViewer ? <ViewerScreen narrow={narrow} dragging={dragging} /> : <StartScreen dragging={dragging} />}
      {status === "needsPassword" && <PasswordDialog />}
      {failedKind && <OpenErrorDialog kind={failedKind} fileName={fileName} onClose={() => void session.close()} />}
      {fileError && fileError.kind !== "password-required" && fileError.kind !== "wrong-password" && (
        <OpenErrorDialog kind={fileError.kind} fileName={fileError.fileName} onClose={() => clearFileError(null)} />
      )}
      <UnsavedChangesDialog />
      <Toaster />
    </>
  );
}
