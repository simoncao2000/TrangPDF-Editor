import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TOOL_INFO } from "../../editor/tool-catalog";
import { useAnnotationUi, type Tool } from "../../state/annotation-store";
import { PaletteButton } from "./PaletteButton";

/** Gap between the button and its menu, in CSS pixels. */
const MENU_GAP = 8;

interface ToolGroupButtonProps {
  /** "Markup" or "Shapes". */
  readonly name: "Markup" | "Shapes";
  readonly tools: readonly Tool[];
  /** The tool in hand. */
  readonly current: Tool;
  /** The palette stands upright, so the menu opens to its side rather than below. */
  readonly upright: boolean;
  readonly disabled: boolean;
  onPick(tool: Tool): void;
}

/**
 * A palette button for a group of related tools (Markup: highlight, underline, strikethrough,
 * squiggly; Shapes: rectangle, ellipse, line, arrow). It shows the group's last-used tool and
 * picks it; pressed again, it opens a menu of the group. The menu is drawn over everything, at the
 * button's place on screen, so the palette's scrolling never cuts it off.
 * @param props The group, the tool in hand, the palette's orientation and the pick callback.
 * @returns The button, and its menu while open.
 */
export function ToolGroupButton({ name, tools, current, upright, disabled, onPick }: ToolGroupButtonProps) {
  const last = useAnnotationUi((state) => (name === "Markup" ? state.lastMarkup : state.lastShape));
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inHand = tools.includes(current);
  const shown = TOOL_INFO[inHand ? current : last];

  useEffect(() => {
    if (!menuAt) return;
    const close = (event: Event) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setMenuAt(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuAt(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuAt]);

  const onClick = () => {
    if (!inHand) return onPick(last);
    if (menuAt) return setMenuAt(null);
    const box = buttonRef.current?.getBoundingClientRect();
    if (box)
      setMenuAt(
        upright ? { left: box.right + MENU_GAP, top: box.top } : { left: box.left, top: box.bottom + MENU_GAP },
      );
  };

  return (
    <>
      <PaletteButton
        ref={buttonRef}
        icon={shown.icon}
        label={`${name}: ${shown.label}`}
        shortcut={shown.key?.toUpperCase()}
        pressed={inHand}
        disabled={disabled}
        hasMenu
        expanded={menuAt !== null}
        onClick={onClick}
      />
      {menuAt &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={name}
            className="fixed z-50 grid min-w-52 gap-px rounded-xs bg-raised p-1 shadow-2 ring-1 ring-line/50"
            style={menuAt}
          >
            {tools.map((tool) => {
              const { label, key, icon: Icon } = TOOL_INFO[tool];
              return (
                <button
                  key={tool}
                  type="button"
                  role="menuitemradio"
                  aria-checked={tool === current}
                  onClick={() => {
                    onPick(tool);
                    setMenuAt(null);
                  }}
                  className="flex min-h-8 items-center gap-2.5 rounded-[2px] px-2 text-left text-sm text-ink outline-none hover:bg-hover focus-visible:bg-hover aria-checked:bg-hover aria-checked:font-semibold"
                >
                  <Icon className="size-4 text-muted" aria-hidden="true" />
                  {label}
                  {key && <span className="ml-auto font-mono text-2xs text-muted">{key.toUpperCase()}</span>}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
