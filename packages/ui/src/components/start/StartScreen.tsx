import { useFileOpener } from "../../editor/use-file-opener";
import { Button } from "../primitives/Button";
import { Logo } from "../primitives/Logo";
import { ThemeMenu } from "../primitives/ThemeMenu";
import { RecentFiles } from "./RecentFiles";
import { FolderOpen, Upload } from "lucide-react";

interface StartScreenProps {
  /** True while a file is dragged over the window; the drop zone lights up. */
  readonly dragging: boolean;
}

/**
 * The upload screen: a drop target with Choose a file, and recent files.
 * Dropping works anywhere on the window; the zone only shows where.
 * @param props Drag state from the window-level drop handler.
 * @returns The start screen.
 */
export function StartScreen({ dragging }: StartScreenProps) {
  const { openFromPicker } = useFileOpener();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-canvas">
      <header className="flex min-h-14 items-center gap-2 border-b border-divider bg-toolbar px-4">
        <Logo withWord />
        <span className="flex-1" />
        <ThemeMenu />
      </header>

      <main className="overflow-y-auto px-4 pt-[clamp(28px,7vh,80px)] pb-6">
        <div className="mx-auto grid w-full max-w-160 gap-5">
          <div className="relative grid gap-3 pr-24">
            <p className="text-muted">Open your PDFs here. Files stay on this device; nothing is uploaded.</p>
          </div>

          <div
            data-state={dragging ? "drag-over" : undefined}
            className="relative grid justify-items-center gap-3 rounded-sm border border-divider bg-raised px-4 py-8 text-center transition-[scale,border-color] duration-(--duration-enter) ease-out data-[state=drag-over]:scale-[1.01] data-[state=drag-over]:border-signal"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-2 rounded-sm border-[1.5px] border-dashed border-divider in-data-[state=drag-over]:border-signal"
            />
            <span className="grid size-13 place-items-center rounded-[48%_43%_50%_46%] border border-line bg-signal-soft text-signal">
              <Upload className="size-6" aria-hidden="true" />
            </span>
            <h2 className="font-hand text-[1.44rem] font-normal">{dragging ? "Drop to open" : "Drop a PDF here"}</h2>
            <p className="text-sm text-muted">or choose one from this device</p>
            <Button
              variant="primary"
              size="lg"
              icon={FolderOpen}
              shortcut={isMac ? "⌘O" : "Ctrl O"}
              onClick={openFromPicker}
            >
              Choose a file
            </Button>
          </div>

          <RecentFiles />
        </div>
      </main>
    </div>
  );
}
