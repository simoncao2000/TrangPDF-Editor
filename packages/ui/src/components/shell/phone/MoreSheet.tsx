import { ChevronRight, Palette } from "lucide-react";
import { useDocument } from "../../../editor/hooks";
import { useCommands, type Command } from "../../../editor/use-commands";
import { useOpenPanel } from "../../../routing/hooks";
import { Sheet } from "../../primitives/Sheet";

const FILE_ACTIONS = ["export-pages", "import-pages"];

/**
 * Shows the existing file and theme commands in the phone menu.
 * @returns The More sheet.
 */
export function MoreSheet() {
  const fileName = useDocument((state) => state.fileName);
  const commands = useCommands();
  const { closePanel } = useOpenPanel();
  const fileActions = FILE_ACTIONS.map((id) => commands.find((command) => command.id === id));
  const saveAs =
    commands.find((command) => command.id === "save-as") ??
    commands.find((command) => command.id === "save" && command.title === "Download");
  const closeFile = commands.find((command) => command.id === "close");

  return (
    <Sheet title={fileName ?? "More"} onDismiss={closePanel}>
      <div className="grid gap-0.5">
        {saveAs && <MoreAction command={saveAs} label="Save as…" onClose={closePanel} />}
        {fileActions.map(
          (command) => command && <MoreAction key={command.id} command={command} onClose={closePanel} />,
        )}
        <details className="group border-t border-divider">
          <summary className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xs px-3 text-sm active:bg-hover [&::-webkit-details-marker]:hidden">
            <Palette className="size-4.5 shrink-0" aria-hidden="true" />
            Theme
            <ChevronRight
              aria-hidden="true"
              className="ml-auto size-4 transition-transform duration-[180ms] ease-(--curve-out) group-open:rotate-90"
            />
          </summary>
          {commands
            .filter(({ id }) => id.startsWith("theme-"))
            .map((command) => (
              <MoreAction key={command.id} command={command} label={command.title.slice(7)} onClose={closePanel} />
            ))}
        </details>
        {closeFile && <MoreAction command={closeFile} onClose={closePanel} />}
      </div>
    </Sheet>
  );
}

interface MoreActionProps {
  readonly command: Command;
  readonly label?: string;
  onClose(after?: () => void): void;
}

/**
 * Dismisses the menu and runs an existing editor command.
 * @param props The command, optional visible label and dismiss handler.
 * @returns The action button.
 */
function MoreAction({ command, label, onClose }: MoreActionProps) {
  /**
   * Runs picker commands in the tap event so they retain browser user activation.
   * @returns Nothing.
   */
  function run() {
    if (command.id === "save-as" || command.id === "save" || command.id === "import-pages") {
      onClose();
      command.run();
    } else {
      onClose(command.run);
    }
  }

  return (
    <button
      type="button"
      disabled={!command.enabled}
      onClick={run}
      className="flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-sm active:bg-hover disabled:text-disabled"
    >
      <command.icon className="size-4.5 shrink-0" aria-hidden="true" />
      {label ?? command.title}
    </button>
  );
}
