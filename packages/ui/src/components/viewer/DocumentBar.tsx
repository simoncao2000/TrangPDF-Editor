import { ArrowLeft, FolderOpen, LayoutGrid, Save, Undo2, X } from "lucide-react";
import { useDocument, useEditorServices } from "../../editor/hooks";
import { useDocumentActions } from "../../editor/use-document-actions";
import { useFileOpener } from "../../editor/use-file-opener";
import { useViewer } from "../../state/viewer-store";
import { Button } from "../primitives/Button";
import { IconButton } from "../primitives/IconButton";
import { Logo } from "../primitives/Logo";
import { ThemeMenu } from "../primitives/ThemeMenu";

interface DocumentBarProps {
  readonly narrow: boolean;
}

/**
 * The file's state in words, shown only when it is not simply open and saved.
 * @returns A small status label, or nothing.
 */
function FileStatus() {
  const status = useDocument((state) => state.status);
  const text = { loading: "Opening…", dirty: "Unsaved changes", saving: "Saving…" }[status as string];
  if (!text) return null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 font-mono text-xs ${status === "dirty" ? "text-warning" : "text-muted"}`}>
      {status === "dirty" && <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />}
      {text}
    </span>
  );
}

/**
 * The top bar while a document is open: mark, file name and state, Open, Save, Save as, theme,
 * Close (Undo and Redo sit in the tool row below). Narrow shows Undo, Organize pages and Save;
 * Open stays on the start screen.
 * @param props Layout variant.
 * @returns The header.
 */
export function DocumentBar({ narrow }: DocumentBarProps) {
  const { session } = useEditorServices();
  const actions = useDocumentActions();
  const { openFromPicker } = useFileOpener();
  const { mode, setMode } = useViewer();
  const fileName = useDocument((state) => state.fileName);
  const status = useDocument((state) => state.status);
  const undoLabel = useDocument((state) => state.undoLabel);
  const editable = status === "clean" || status === "dirty";
  const close = () => actions.guardUnsaved(() => void session.close());

  const undo = <IconButton icon={Undo2} label={undoLabel ? `Undo ${undoLabel.toLowerCase()}` : "Undo"} disabled={!editable || !undoLabel} onClick={actions.undo} />;

  if (narrow) {
    return (
      <header className="flex min-h-14 items-center gap-0.5 border-b border-divider bg-toolbar px-1.5">
        <IconButton icon={ArrowLeft} label="Close file" onClick={close} />
        <div className="grid min-w-0 flex-1 px-1">
          <strong className="truncate font-hand text-[1.25rem] leading-tight font-normal">{fileName}</strong>
          <FileStatus />
        </div>
        {undo}
        <IconButton icon={LayoutGrid} label={mode === "organize" ? "Back to reading" : "Organize pages"} disabled={!editable} aria-pressed={mode === "organize"} onClick={() => setMode(mode === "organize" ? "read" : "organize")} />
        <IconButton icon={Save} label="Save" disabled={status !== "dirty"} onClick={() => void actions.save()} />
        <ThemeMenu />
      </header>
    );
  }

  return (
    <header className="flex min-h-14 items-center gap-1.5 border-b border-divider bg-toolbar pr-3 pl-4">
      <Logo />
      <div className="flex min-w-0 items-center gap-2.5 border-l border-divider pl-3">
        <strong className="truncate font-hand text-[1.45rem] leading-none font-normal">{fileName}</strong>
        <FileStatus />
      </div>
      <span className="flex-1" />
      <Button variant="ghost" icon={FolderOpen} onClick={openFromPicker}>
        Open
      </Button>
      <Button variant="ghost" disabled={!editable} onClick={() => void actions.saveAs()}>
        Save as…
      </Button>
      <Button variant="primary" icon={Save} disabled={status !== "dirty"} shortcut={navigator.platform.includes("Mac") ? "⌘S" : "Ctrl S"} onClick={() => void actions.save()}>
        {status === "saving" ? "Saving…" : "Save"}
      </Button>
      <ThemeMenu />
      <IconButton icon={X} label="Close file" onClick={close} />
    </header>
  );
}
