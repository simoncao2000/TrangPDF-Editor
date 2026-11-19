import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  /** A Lucide icon component, e.g. `FolderOpen`. */
  readonly icon?: LucideIcon;
  /** Keyboard shortcut hint, e.g. "Ctrl O". Shown after the label. */
  readonly shortcut?: string;
  readonly children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-action text-on-action border-action",
  secondary: "bg-raised text-ink border-line hover:bg-hover",
  ghost: "bg-transparent text-ink border-transparent hover:bg-hover",
};

const SIZES: Record<Size, string> = {
  md: "min-h-(--control-target) px-3 text-sm",
  lg: "min-h-11 px-5 text-base",
};

/**
 * The standard text button, with the sketchbook's flat outline.
 * Presses scale to 0.97 on pointer press only; keyboard activation stays instant.
 * @param props Variant, size, optional icon and shortcut hint, plus native button props.
 * @returns A `<button>`.
 */
export function Button({ variant = "secondary", size = "md", icon: IconComponent, shortcut, className = "", children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border font-semibold whitespace-nowrap transition-[background-color,transform] duration-(--duration-press) ease-out active:scale-(--press-scale) disabled:cursor-default disabled:border-divider disabled:bg-transparent disabled:text-disabled ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {IconComponent && <IconComponent className="size-4" aria-hidden="true" />}
      {children}
      {shortcut && <kbd className="font-mono text-2xs font-normal opacity-70">{shortcut}</kbd>}
    </button>
  );
}
