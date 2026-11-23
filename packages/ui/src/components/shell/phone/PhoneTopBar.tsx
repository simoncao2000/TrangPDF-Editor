import { ChevronDown, Ellipsis, FileText, Save, type LucideIcon } from "lucide-react";
import { useStore } from "zustand";
import { useDocument, useEditorServices } from "../../../editor/hooks";
import { useCommands } from "../../../editor/use-commands";
import { useDocumentActions } from "../../../editor/use-document-actions";
import { useOpenPanel } from "../../../routing/hooks";

/**
 * Shows the file switcher, history, save and file menu controls.
 * @returns The phone header.
 */
export function PhoneTopBar() {
  const { files, workspace } = useEditorServices();
  const { save, saveAs } = useDocumentActions();
  const commands = useCommands();
  const status = useDocument((state) => state.status);
  const fileName = useDocument((state) => state.fileName);
  const tabCount = useStore(workspace.store, (state) => state.tabs.length);
  const { panel, openPanel } = useOpenPanel();
  const dirty = status === "dirty";

  return (
    <header className="flex min-h-13 items-center gap-0.5 border-b border-divider bg-toolbar px-2">
      <button
        type="button"
        onClick={() => openPanel("files")}
        aria-label={`${fileName ?? "No file"}, ${tabCount} open. Switch file`}
        aria-expanded={panel === "files"}
        aria-haspopup="dialog"
        className="flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-sm px-2 active:bg-hover"
      >
        <FileText className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="truncate font-hand text-lg">{fileName}</span>
        <span className="shrink-0 rounded-pill bg-pressed px-1.5 text-2xs text-muted">{tabCount}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
      {commands
        .filter(({ id }) => id === "undo" || id === "redo")
        .map((command) => (
          <TopAction
            key={command.id}
            icon={command.icon}
            label={command.title}
            disabled={!command.enabled}
            onClick={command.run}
          />
        ))}
      <TopAction
        icon={Save}
        label="Save"
        disabled={!dirty}
        dirty={dirty}
        onClick={() => void (files.canSaveInPlace ? save() : saveAs())}
      />
      <TopAction icon={Ellipsis} label="More" expanded={panel === "more"} onClick={() => openPanel("more")} />
    </header>
  );
}

interface TopActionProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly disabled?: boolean;
  readonly dirty?: boolean;
  readonly expanded?: boolean;
  onClick(): void;
}

/**
 * Renders a top bar action with a 44 px target.
 * @param props The icon, accessible label, state and action.
 * @returns The button.
 */
function TopAction({ icon: Icon, label, disabled, dirty, expanded, onClick }: TopActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      title={label}
      disabled={disabled}
      data-dirty={dirty || undefined}
      onClick={onClick}
      className="relative grid size-11 shrink-0 place-items-center rounded-md text-ink active:bg-hover disabled:text-disabled data-dirty:after:absolute data-dirty:after:top-[9px] data-dirty:after:right-[9px] data-dirty:after:size-[7px] data-dirty:after:rounded-pill data-dirty:after:bg-signal data-dirty:after:ring-2 data-dirty:after:ring-toolbar"
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
