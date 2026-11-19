import { useEffect, useRef } from "react";

export interface Shortcut {
  /** `KeyboardEvent.key`, lower case for letters (e.g. "z", "delete"). */
  readonly key: string;
  /** Needs Ctrl (Cmd on macOS). */
  readonly mod?: boolean;
  readonly shift?: boolean;
}

/**
 * True when the user is typing, so single-key shortcuts must not fire.
 * @param target The event target.
 * @returns Whether it is an editable field.
 */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * Binds keyboard shortcuts on the window. Shortcuts without Ctrl/Cmd are ignored while typing.
 * @param bindings Each shortcut with its action; the browser default is prevented when one runs.
 * @param enabled Turn off while a modal is open.
 */
export function useShortcuts(bindings: readonly (readonly [Shortcut, () => void])[], enabled = true): void {
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      for (const [shortcut, action] of latest.current) {
        if (event.key.toLowerCase() !== shortcut.key) continue;
        if (Boolean(shortcut.mod) !== mod || Boolean(shortcut.shift) !== event.shiftKey || event.altKey) continue;
        if (!shortcut.mod && isTyping(event.target)) continue;
        event.preventDefault();
        action();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/**
 * Binds one Ctrl+key (Cmd+key on macOS) shortcut.
 * @param key The key, lower case (e.g. "o").
 * @param action Runs on the shortcut.
 * @param enabled Turn off while a modal is open.
 */
export function useModShortcut(key: string, action: () => void, enabled = true): void {
  useShortcuts([[{ key, mod: true }, action]], enabled);
}
