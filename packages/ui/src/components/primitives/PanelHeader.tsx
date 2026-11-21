import type { ReactNode } from "react";

interface PanelHeaderProps {
  /** Id for the heading, so the panel can be labelled by it. */
  readonly id: string;
  readonly title: string;
  /** Icon buttons on the right. */
  readonly actions?: ReactNode;
}

/**
 * The header every sidebar shares: the title in the hand font and actions on the right, at one
 * height so the sidebars line up with each other.
 * @param props Heading id, title and actions.
 * @returns The header row.
 */
export function PanelHeader({ id, title, actions }: PanelHeaderProps) {
  return (
    // Same height as the tab row beside it, so the two read as one line (VS Code).
    <div className="flex h-9.5 shrink-0 items-center gap-1 border-b border-divider pr-1.5 pl-4">
      <h2 id={id} className="flex min-w-0 flex-1 items-baseline gap-2 font-hand text-lg leading-none font-normal">
        <span className="truncate">{title}</span>
      </h2>
      {actions}
    </div>
  );
}
