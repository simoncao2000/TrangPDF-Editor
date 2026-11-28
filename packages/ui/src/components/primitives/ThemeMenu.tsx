import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "../../state/theme-store";
import { DropdownMenu, type MenuOption } from "./DropdownMenu";

const OPTIONS: readonly MenuOption<ThemePreference>[] = [
  { value: "system", label: "Match system", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/**
 * Theme switcher: shows the current theme's icon and opens Match system, Light and Dark.
 * @returns The dropdown.
 */
export function ThemeMenu() {
  const { preference, setPreference } = useTheme();
  const current = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0]!;
  const CurrentIcon = current.icon ?? Monitor;

  return (
    <DropdownMenu
      label="Theme"
      triggerLabel={`Theme: ${current.label}`}
      entries={OPTIONS}
      value={preference}
      onSelect={setPreference}
      triggerClassName="min-h-(--control-target) px-2 hover:bg-hover"
      renderTrigger={(open) => (
        <>
          <CurrentIcon className="size-4.5" aria-hidden="true" />
          <ChevronDown
            className={`size-3.5 text-muted transition-transform duration-(--duration-pop) ease-out ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </>
      )}
    />
  );
}
