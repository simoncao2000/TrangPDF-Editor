import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** A Lucide icon component, e.g. `X`. */
  readonly icon: LucideIcon;
  /** Accessible name, also shown as the tooltip. */
  readonly label: string;
}

/**
 * A square icon-only button.
 * @param props Icon, accessible label, plus native button props.
 * @returns A `<button>` with `aria-label` and `title`.
 */
export function IconButton({ icon: IconComponent, label, className = "", type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-grid size-(--control-target) shrink-0 place-items-center rounded-sm text-ink transition-[background-color,transform] duration-(--duration-press) ease-out hover:bg-hover active:scale-[0.94] disabled:cursor-default disabled:text-disabled disabled:opacity-60 disabled:hover:bg-transparent ${className}`}
      {...rest}
    >
      <IconComponent className="size-4.5" aria-hidden="true" />
    </button>
  );
}
