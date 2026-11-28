import { PhoneShell } from "../shell/PhoneShell";
import { TitleBar } from "../shell/TitleBar";
import { Workbench } from "../shell/Workbench";

interface ViewerScreenProps {
  readonly narrow: boolean;
  /** True while a file is dragged over the window. */
  readonly dragging: boolean;
  /** False while a dialog is open, so shortcuts do not fire behind it. */
  readonly keysEnabled: boolean;
}

/**
 * The editor with documents open: the desktop shell (title bar, then the workbench) or the phone
 * shell, with a drop target while a file is dragged over the window.
 * @param props Layout variant, drag state and whether shortcuts are on.
 * @returns The editor screen.
 */
export function ViewerScreen({ narrow, dragging, keysEnabled }: ViewerScreenProps) {
  return (
    <div
      className={`relative grid h-dvh grid-cols-[minmax(0,1fr)] bg-canvas ${narrow ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_minmax(0,1fr)]"}`}
    >
      {narrow ? (
        <PhoneShell keysEnabled={keysEnabled && !dragging} />
      ) : (
        <>
          <TitleBar keysEnabled={keysEnabled} />
          <Workbench keysEnabled={keysEnabled && !dragging} />
        </>
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-sm border-2 border-dashed border-signal bg-signal-soft/80">
          <p className="text-2xl font-hand text-ink">Drop to open in a new tab</p>
        </div>
      )}
    </div>
  );
}
