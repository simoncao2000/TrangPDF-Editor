import { useMemo } from "react";
import { MENUS, useCommands, type Command, type MenuName } from "../../editor/use-commands";
import { DropdownMenu, type MenuEntry } from "../primitives/DropdownMenu";

/**
 * The menu bar, VS Code style: File, Edit, View, Tools and Pages, each opening its commands
 * (from the shared command list) with icons and shortcuts. Commands that cannot run are shown
 * but disabled.
 * @returns The menu bar.
 */
export function MenuBar() {
  const commands = useCommands();
  const byMenu = useMemo(() => groupByMenu(commands), [commands]);
  return (
    <nav aria-label="Menu" className="flex items-center">
      {MENUS.map((menu) => (
        <DropdownMenu
          key={menu}
          label={menu}
          triggerLabel={menu}
          kind="action"
          placement="below-start"
          widthClassName="w-68"
          triggerClassName="h-7 px-2 text-sm"
          renderTrigger={() => menu}
          entries={byMenu.get(menu)?.entries ?? []}
          value={null}
          onSelect={(id) => byMenu.get(menu)?.run.get(id)?.()}
        />
      ))}
    </nav>
  );
}

/**
 * Turns the command list into menu entries, with a separator between groups.
 * @param commands Every command.
 * @returns Per menu: its entries and how to run each one.
 */
function groupByMenu(
  commands: readonly Command[],
): Map<MenuName, { entries: MenuEntry<string>[]; run: Map<string, () => void> }> {
  const menus = new Map<MenuName, { entries: MenuEntry<string>[]; run: Map<string, () => void>; lastGroup: number }>();
  for (const command of commands) {
    const menu = menus.get(command.menu) ?? {
      entries: [] as MenuEntry<string>[],
      run: new Map<string, () => void>(),
      lastGroup: command.group,
    };
    if (menu.entries.length > 0 && command.group !== menu.lastGroup) menu.entries.push("separator");
    menu.entries.push({
      value: command.id,
      label: command.title,
      icon: command.icon,
      shortcut: command.shortcut,
      disabled: !command.enabled,
    });
    menu.run.set(command.id, command.run);
    menu.lastGroup = command.group;
    menus.set(command.menu, menu);
  }
  return menus;
}
