import { annotationRevisionOf } from "@pdf-editor/core";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useDocument } from "../../editor/hooks";
import { nextPhoneRecent, PHONE_FIXED, PHONE_MORE, phoneSlotId } from "../../editor/phone-slots";
import { ALL_TOOLS, TOOL_INFO, type PaletteSlot } from "../../editor/tool-catalog";
import { useShortcuts } from "../../hooks/use-shortcut";
import { useAnnotationUi, type SelectedAnnotation, type Tool } from "../../state/annotation-store";
import { useOpenPanel, useViewMode } from "../../routing/hooks";
import { ANNOTATION_NAMES } from "../annotations/annotation-display";
import { usePageAnnotations } from "../annotations/use-page-annotations";
import { PropertiesPanel } from "../inspector/PropertiesPanel";
import { useEditingPageText } from "../text-format/use-text-style";
import { PhoneToolMenu } from "./PhoneToolMenu";

const KEY_STYLE = [
  "relative grid size-[46px] shrink-0 touch-manipulation place-items-center",
  "transition-transform duration-(--duration-press) ease-out motion-safe:active:scale-94",
].join(" ");
const TRAY_STYLE = [
  "absolute inset-x-3 bottom-[calc(var(--space-3)+56px+var(--space-2))] z-4 grid",
  "max-h-[46%] origin-bottom gap-3 overflow-y-auto overscroll-contain rounded-[18px] bg-raised px-4 pt-3 pb-4",
  "shadow-[0_12px_30px_-12px_rgb(var(--shadow-rgb)/40%)] ring-1 ring-ink/9",
  "transition-[opacity,transform] duration-(--duration-enter) ease-out starting:opacity-0",
  "motion-safe:starting:transform-[translateY(10px)_scale(.98)] motion-reduce:transition-opacity",
].join(" ");
const DONE_STYLE = [
  "min-h-11 min-w-11 touch-manipulation rounded-pill px-3 text-sm/none font-semibold text-signal",
  "active:bg-hover motion-safe:active:scale-97",
].join(" ");
const BAR_STYLE = [
  "absolute bottom-3 left-1/2 z-6 flex -translate-x-1/2 items-center gap-0.5",
  "rounded-[18px] bg-raised p-[5px] ring-1 ring-ink/9",
  "shadow-[0_10px_28px_-10px_rgb(var(--shadow-rgb)/38%),0_2px_6px_-2px_rgb(var(--shadow-rgb)/18%)]",
].join(" ");
const RECENT_STYLE = [
  "transition-[opacity,transform] duration-(--duration-enter) ease-out starting:opacity-0",
  "motion-safe:starting:transform-[scale(.9)] motion-reduce:transition-opacity",
].join(" ");
const GROUP_TICK = [
  "after:absolute after:right-[7px] after:bottom-2 after:border-[3px] after:border-transparent",
  "after:border-r-current after:border-b-current after:opacity-55 after:content-['']",
].join(" ");

interface PhoneToolsProps {
  readonly keysEnabled: boolean;
  readonly showTray: boolean;
}

/**
 * Keeps the phone's tool shortcuts and recent slot available across Read and Organize.
 * @param props Whether shortcuts and the tool tray are available.
 * @returns The fixed bar and options tray in Read mode.
 */
export function PhoneTools({ keysEnabled, showTray }: PhoneToolsProps) {
  const status = useDocument((state) => state.status);
  const { mode, setMode } = useViewMode();
  const tool = useAnnotationUi((state) => state.tool);
  const setTool = useAnnotationUi((state) => state.setTool);
  const selected = useAnnotationUi((state) => state.selected);
  const pageText = useEditingPageText();
  const trayTitleId = useId();
  const [recent, setRecent] = useState<PaletteSlot | null>(null);
  const editable = status === "clean" || status === "dirty";

  /**
   * Activates a tool and brings the page back into view.
   * @param next The tool to activate.
   * @returns Nothing.
   */
  function pick(next: Tool) {
    setMode("read");
    setTool(next);
  }

  useShortcuts(
    [
      ...ALL_TOOLS.flatMap(({ tool: next, key }) => (key ? [[{ key }, () => pick(next)] as const] : [])),
      [{ key: "escape" }, () => setTool("select")] as const,
    ],
    keysEnabled && editable,
  );

  if (mode === "organize") return null;
  return (
    <>
      {showTray && (pageText || selected || tool !== "select") && (
        <section aria-labelledby={trayTitleId} className={TRAY_STYLE}>
          <div className="flex items-center justify-between gap-2">
            <h2 id={trayTitleId} className="font-hand text-md/[1.1]">
              {pageText ? "Text" : selected ? <SelectedMarkName selected={selected} /> : TOOL_INFO[tool].label}
            </h2>
            <button type="button" className={DONE_STYLE} onClick={() => setTool("select")}>
              Done
            </button>
          </div>
          <PropertiesPanel hideHeading />
        </section>
      )}
      <PhoneToolBar editable={editable} recent={recent} onPick={pick} onRecent={setRecent} />
    </>
  );
}

/**
 * Looks up the selected mark's kind for the tray heading.
 * @param props The selected mark's page and identifier.
 * @returns The mark's kind label once its page annotations are available.
 */
function SelectedMarkName({ selected }: { readonly selected: SelectedAnnotation }) {
  const revision = useDocument((state) => annotationRevisionOf(state, selected.pageId));
  const annotation = usePageAnnotations(selected.pageId, revision).find((candidate) => candidate.id === selected.id);
  return annotation ? ANNOTATION_NAMES[annotation.kind] : null;
}

interface PhoneToolBarProps {
  readonly editable: boolean;
  readonly recent: PaletteSlot | null;
  onPick(tool: Tool): void;
  onRecent(slot: PaletteSlot | null): void;
}

/**
 * Shows the fixed tools, recent slot and their anchored menus.
 * @param props Editing state and tool selection handlers.
 * @returns The toolbar and its dismissible page scrim.
 */
function PhoneToolBar({ editable, recent, onPick, onRecent }: PhoneToolBarProps) {
  const tool = useAnnotationUi((state) => state.tool);
  const lastMarkup = useAnnotationUi((state) => state.lastMarkup);
  const lastShape = useAnnotationUi((state) => state.lastShape);
  const [groupMenu, setGroupMenu] = useState<string | null>(null);
  const { panel, openPanel, closePanel } = useOpenPanel();
  const open = panel === "tools" ? "more" : panel ? null : groupMenu;
  const toolbarId = useId();

  /**
   * Dismisses the column and restores focus to its trigger.
   * @returns Nothing.
   */
  const closeMenu = useCallback(() => {
    setGroupMenu(null);
    if (panel === "tools") closePanel();
    document.getElementById(`${toolbarId}-${open}`)?.focus();
  }, [closePanel, open, panel, toolbarId]);

  /**
   * Captures Escape before the editor's global tool shortcuts handle it.
   * @returns The listener cleanup while a menu is open.
   */
  function bindEscape() {
    if (!open) return;

    /**
     * Dismisses the menu on Escape.
     * @param event The window keyboard event.
     * @returns Nothing.
     */
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu();
    }

    window.addEventListener("keydown", dismissOnEscape, true);
    return () => window.removeEventListener("keydown", dismissOnEscape, true);
  }

  useEffect(bindEscape, [open, closeMenu]);

  /**
   * Opens or toggles the menu attached to a tool key.
   * @param id The menu's identity.
   * @returns Nothing.
   */
  function toggleMenu(id: string) {
    if (open === id) {
      closeMenu();
      return;
    }
    if (id === "more") {
      setGroupMenu(null);
      openPanel("tools");
    } else {
      setGroupMenu(id);
      if (panel === "tools") closePanel();
    }
  }

  /**
   * Resolves a slot to the tool it currently represents.
   * @param slot A single tool or a remembered group.
   * @returns The represented tool.
   */
  function representedTool(slot: PaletteSlot): Tool {
    if (slot.kind === "tool") return slot.tool;
    return slot.name === "Markup" ? lastMarkup : lastShape;
  }

  /**
   * Picks the corresponding catalog slot from the More column.
   * @param index The menu row index.
   * @returns Nothing.
   */
  function pickMore(index: number) {
    const slot = PHONE_MORE[index];
    if (!slot) return;
    onRecent(nextPhoneRecent(recent, slot));
    onPick(representedTool(slot));
    closeMenu();
  }

  /**
   * Renders a tool key and its group column, when applicable.
   * @param slot The slot to render.
   * @param isRecent Whether it occupies the recent position.
   * @returns The key and optional menu.
   */
  function renderSlot(slot: PaletteSlot, isRecent = false) {
    const id = phoneSlotId(slot);
    const represented = representedTool(slot);
    const { icon: Icon, key, label } = TOOL_INFO[represented];
    const group = slot.kind === "group" ? slot : null;
    const pressed = group ? group.tools.includes(tool) : represented === tool;
    const name = group ? `${group.name}: ${label}` : label;
    return (
      <div key={id} className={isRecent ? `relative ${RECENT_STYLE}` : "relative"}>
        <button
          type="button"
          id={group ? `${toolbarId}-${id}` : undefined}
          aria-label={`${name}${isRecent ? " (last used)" : key ? ` (${key.toUpperCase()})` : ""}`}
          aria-pressed={pressed}
          aria-haspopup={group ? "menu" : undefined}
          aria-expanded={group ? open === id : undefined}
          disabled={!editable}
          onClick={() => {
            if (group) {
              toggleMenu(id);
            } else {
              onPick(represented);
              if (open) closeMenu();
            }
          }}
          className={`${KEY_STYLE} rounded-[13px] ${pressed ? "bg-action text-on-action" : ""} ${group ? GROUP_TICK : ""}`}
        >
          <Icon className="size-[22px]" aria-hidden="true" />
        </button>
        {group && (
          <PhoneToolMenu
            label={group.name}
            open={open === id}
            alignStart
            rows={group.tools.map((member) => TOOL_INFO[member])}
            checked={tool}
            onPick={(index) => {
              const member = group.tools[index];
              if (!member) return;
              onPick(member);
              closeMenu();
            }}
          />
        )}
      </div>
    );
  }

  const moreOpen = open === "more";
  const scrimState = open
    ? "opacity-100 duration-(--duration-enter)"
    : "pointer-events-none opacity-0 duration-(--duration-exit)";
  return (
    <>
      <div
        aria-hidden="true"
        onClick={closeMenu}
        className={`absolute inset-0 z-5 bg-canvas/55 transition-opacity ease-out ${scrimState}`}
      />
      <div role="toolbar" aria-label="Tools" className={BAR_STYLE}>
        {PHONE_FIXED.map((slot) => renderSlot(slot))}
        <span aria-hidden="true" className="mx-[3px] h-[26px] w-px shrink-0 bg-divider" />
        {recent && renderSlot(recent, true)}
        <button
          type="button"
          id={`${toolbarId}-more`}
          aria-label={moreOpen ? "Close tools" : "More tools"}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          disabled={!editable}
          onClick={() => toggleMenu("more")}
          className={`${KEY_STYLE} ms-0.5 rounded-full ${moreOpen ? "bg-action text-on-action" : "bg-pressed"}`}
        >
          <Plus
            aria-hidden="true"
            className={`size-[22px] transition-transform duration-(--duration-enter) ease-out motion-reduce:transition-none ${moreOpen ? "rotate-135" : ""}`}
          />
        </button>
        <PhoneToolMenu
          label="More tools"
          open={moreOpen}
          rows={PHONE_MORE.map((slot) => {
            const info = TOOL_INFO[representedTool(slot)];
            return slot.kind === "group" ? { ...info, label: slot.name } : info;
          })}
          checked={tool}
          onPick={pickMore}
        />
      </div>
    </>
  );
}
