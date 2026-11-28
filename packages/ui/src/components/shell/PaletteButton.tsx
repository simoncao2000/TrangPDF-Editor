import type { LucideIcon } from "lucide-react";
import type { Ref } from "react";

interface PaletteButtonProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly shortcut?: string;
  /** Pressed state for the tool in hand; leave out for plain actions. */
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  /** Quieter colour for secondary actions (rotate). */
  readonly muted?: boolean;
  /** For a button that opens a menu: whether it is open. */
  readonly expanded?: boolean;
  /** Small mark in the corner: the button has a menu of related tools. */
  readonly hasMenu?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
  onClick(): void;
}

/**
 * A palette button: an icon, its name in the tooltip, and a filled ink square for the tool in hand.
 * @param props Icon, label, shortcut, pressed state and click handler.
 * @returns The button.
 */
export function PaletteButton({
  icon: Icon,
  label,
  shortcut,
  pressed,
  disabled = false,
  muted = false,
  expanded,
  hasMenu = false,
  ref,
  onClick,
}: PaletteButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-haspopup={hasMenu ? "menu" : undefined}
      aria-expanded={expanded}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
      className={`relative grid size-(--control-target) shrink-0 place-items-center rounded-sm transition-[background-color,color,transform] duration-(--duration-press) ease-out active:scale-[0.94] disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent ${
        pressed ? "bg-action text-on-action" : `${muted ? "text-muted" : "text-ink"} hover:bg-hover`
      }`}
    >
      <Icon className="size-4.5" aria-hidden="true" />
      {hasMenu && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 bottom-0.5 size-1.5 bg-current opacity-60 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
        />
      )}
    </button>
  );
}
