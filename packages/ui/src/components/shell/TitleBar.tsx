import { PanelLeft, PanelRight, Search } from "lucide-react";
import { useDocument } from "../../editor/hooks";
import { useShortcuts } from "../../hooks/use-shortcut";
import { useLayout } from "../../state/layout-store";
import { usePalette } from "../../state/palette-store";
import { IconButton } from "../primitives/IconButton";
import { Logo } from "../primitives/Logo";
import { ThemeMenu } from "../primitives/ThemeMenu";
import { MenuBar } from "./MenuBar";

/** "⌘" on Apple keyboards, "Ctrl" elsewhere. */
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";

interface TitleBarProps {
  /** False while a dialog is open, so shortcuts do not fire behind it. */
  readonly keysEnabled: boolean;
}

/**
 * The top bar, VS Code style: the mark and the menus on the left, the command center in the
 * middle (opens the command palette), and on the right the sidebar toggles and the theme.
 * Opening and saving files live in the File menu.
 * @param props Whether keyboard shortcuts are on.
 * @returns The title bar.
 */
export function TitleBar({ keysEnabled }: TitleBarProps) {
  const fileName = useDocument((state) => state.fileName);
  const { pagesOpen, propertiesOpen, togglePages, toggleProperties } = useLayout();
  const showPalette = usePalette((state) => state.show);

  useShortcuts(
    [
      [{ key: "k", mod: true }, () => showPalette()],
      [{ key: "p", mod: true }, () => showPalette()],
      [{ key: "p", mod: true, shift: true }, () => showPalette(">")],
      [{ key: "b", mod: true }, togglePages],
    ],
    keysEnabled,
  );

  return (
    <header className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(12rem,26rem)_minmax(0,1fr)] items-center gap-3 border-b border-divider bg-toolbar px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Logo />
        <MenuBar />
      </div>

      <button
        type="button"
        onClick={() => showPalette()}
        className="flex h-7.5 min-w-0 items-center gap-2 rounded-sm bg-hover px-3 text-sm text-muted transition-colors hover:bg-pressed hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        <Search className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{fileName ? `Search ${fileName}` : "Search or run a command"}</span>
        <kbd className="ml-auto shrink-0 font-mono text-2xs opacity-75">{MOD}K</kbd>
      </button>

      <div className="flex items-center justify-end gap-1">
        <IconButton
          icon={PanelLeft}
          label={pagesOpen ? `Hide Pages (${MOD}B)` : `Show Pages (${MOD}B)`}
          aria-pressed={pagesOpen}
          onClick={togglePages}
        />
        <IconButton
          icon={PanelRight}
          label={propertiesOpen ? "Hide Properties" : "Show Properties"}
          aria-pressed={propertiesOpen}
          onClick={toggleProperties}
        />
        <ThemeMenu />
      </div>
    </header>
  );
}
