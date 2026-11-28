import { useSignatureDrag } from "../signatures/signature-pages";
import { annotationRevisionOf } from "@pdf-editor/core";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from "react";
import { useDocument } from "../../editor/hooks";
import { nextPhoneRecent, PHONE_FIXED, PHONE_MORE, phoneSlotId } from "../../editor/phone-slots";
import { ALL_TOOLS, TOOL_INFO, type PaletteSlot } from "../../editor/tool-catalog";
import { useShortcuts } from "../../hooks/use-shortcut";
import { isDrawingTool, useAnnotationUi, type SelectedAnnotation, type Tool } from "../../state/annotation-store";
import { useOpenPanel, useViewMode } from "../../routing/hooks";
import { ANNOTATION_NAMES } from "../annotations/annotation-display";
import { usePageAnnotations } from "../annotations/use-page-annotations";
import { PropertiesPanel } from "../inspector/PropertiesPanel";
import { useHasTextDraft, useTextStyle } from "../text-format/use-text-style";
import { colorHex } from "../text-format/text-runs";
import { PHONE_SURFACE_MOTION } from "./phone-surface-motion";
import { isPhoneTrayVisible, phoneChromeHeight, PHONE_SURFACE_INITIAL, phoneSurfaceReducer } from "./phone-surface";
import { PhoneToolMenu } from "./PhoneToolMenu";

const KEY_STYLE = [
  "relative grid size-[46px] shrink-0 touch-manipulation place-items-center",
  "transition-transform duration-(--duration-press) ease-out motion-safe:active:scale-94",
].join(" ");
const TRAY_STYLE = [
  "absolute inset-x-3 bottom-[calc(var(--space-3)+56px+var(--space-2))] z-4 grid",
  "max-h-[46%] origin-bottom gap-3 overflow-y-auto overscroll-contain rounded-[18px] bg-raised px-4 pt-3 pb-4",
  "shadow-[0_12px_30px_-12px_rgb(var(--shadow-rgb)/40%)] ring-1 ring-ink/9",
  PHONE_SURFACE_MOTION,
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
/** Delay before an outgoing phone surface is replaced. */
const SURFACE_HANDOFF_MS = 150;

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
  const setTool = useAnnotationUi((state) => state.setTool);
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
  return <PhoneToolBar editable={editable} recent={recent} showTray={showTray} onPick={pick} onRecent={setRecent} />;
}

/**
 * Looks up the selected mark's kind for the tray heading.
 * @param props The selected mark's page and identifier.
 * @returns The mark's kind label once its page annotations are available.
 */
function SelectedMarkName({
  selected,
  chip = false,
}: {
  readonly selected: SelectedAnnotation;
  readonly chip?: boolean;
}) {
  const revision = useDocument((state) => annotationRevisionOf(state, selected.pageId));
  const annotation = usePageAnnotations(selected.pageId, revision).find((candidate) => candidate.id === selected.id);
  if (!annotation) return null;
  const name = ANNOTATION_NAMES[annotation.kind];
  if (!chip) return name;
  const value =
    "lineWidth" in annotation ? annotation.lineWidth : "fontSize" in annotation ? annotation.fontSize : null;
  return (
    <>
      <span className="sr-only">{name}</span>
      {"color" in annotation && (
        <span className="size-3 rounded-full" style={{ backgroundColor: colorHex(annotation.color) }} />
      )}
      {value != null && <span>{value} pt</span>}
    </>
  );
}

interface PhoneToolBarProps {
  readonly showTray: boolean;
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
function PhoneToolBar({ editable, recent, showTray, onPick, onRecent }: PhoneToolBarProps) {
  const draggingSignature = useSignatureDrag((state) => state.dragging);
  const tool = useAnnotationUi((state) => state.tool);
  const lastMarkup = useAnnotationUi((state) => state.lastMarkup);
  const lastShape = useAnnotationUi((state) => state.lastShape);
  const [phoneSurface, dispatchSurface] = useReducer(phoneSurfaceReducer, PHONE_SURFACE_INITIAL);
  const { panel, openPanel, closePanel } = useOpenPanel();
  const open = panel === "tools" ? "more" : panel ? null : phoneSurface.menuId;
  const selected = useAnnotationUi((state) => state.selected);
  const hasDraft = useHasTextDraft();
  const trayTitleId = useId();
  const card = hasDraft ? "draft" : selected ? `mark-${selected.pageId}-${selected.id}` : tool;
  const trayWanted = isPhoneTrayVisible(phoneSurface, showTray, card);
  const wanted = open ?? (trayWanted ? "tray" : null);
  const [surface, setSurface] = useState(wanted);

  /** Releases the outgoing surface after its exit transition. @returns Timer cleanup during handoff. */
  useLayoutEffect(() => {
    if (surface === wanted) return;
    // Matches --duration-exit so only one surface can paint during a handoff.
    const timer = window.setTimeout(() => setSurface(wanted), surface ? SURFACE_HANDOFF_MS : 0);
    return () => window.clearTimeout(timer);
  }, [surface, wanted]);

  const [previousCard, setPreviousCard] = useState(card);
  if (card !== previousCard) {
    setPreviousCard(card);
    dispatchSurface({ type: "tool-changed" });
  }

  const toolbarId = useId();

  /**
   * Dismisses the column and restores focus to its trigger.
   * @returns Nothing.
   */
  const closeMenu = useCallback(() => {
    dispatchSurface({ type: "close-menu" });
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

  const barRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const pointer = useRef<number | null>(null);
  const annotationStyle = useAnnotationUi((state) => (isDrawingTool(tool) ? state.styles[tool] : null));
  const { style: textStyle } = useTextStyle();
  const text = hasDraft || tool === "textBox" || tool === "editText";
  const color = text ? textStyle.color : tool === "image" ? null : annotationStyle?.color;
  const value = text
    ? textStyle.fontSize
    : ["ink", "sign", "square", "circle", "line", "arrow"].includes(tool)
      ? annotationStyle?.lineWidth
      : null;

  useLayoutEffect(() => {
    const bar = barRef.current;
    const host = bar?.parentElement;
    if (!bar || !host) return;
    const tray = chipRef.current ?? trayRef.current;
    /** Publishes layout bounds independently of entry transforms. @returns Nothing. */
    function measure() {
      if (!bar || !host) return;
      const height = phoneChromeHeight(host.clientHeight, bar.offsetTop, tray?.offsetTop);
      host.style.setProperty("--phone-chrome-bottom", `${height}px`);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(bar);
    if (tray) observer.observe(tray);
    return () => {
      observer.disconnect();
      host.style.removeProperty("--phone-chrome-bottom");
    };
  }, [surface, card, phoneSurface.trayCollapsed, draggingSignature]);

  useEffect(() => {
    /** @param y Pointer position in viewport pixels. @returns Whether it overlaps the dock vertically. */
    function inBand(y: number) {
      const bar = barRef.current?.getBoundingClientRect();
      return !!bar && y >= (chipRef.current?.getBoundingClientRect().top ?? bar.top) && y <= bar.bottom;
    }
    /** @param event Page pointer details. @returns Nothing. */
    function start(event: Event) {
      const point = (event as CustomEvent<PointerEvent>).detail;
      pointer.current = point?.pointerId ?? null;
      dispatchSurface({ type: "page-gesture", collapse: trayWanted, inBand: !!point && inBand(point.clientY) });
    }
    /** @param event Moving pointer. @returns Nothing. */
    function move(event: PointerEvent) {
      if (event.pointerId === pointer.current) dispatchSurface({ type: "gesture-band", inBand: inBand(event.clientY) });
    }
    /** @param event Released pointer. @returns Nothing. */
    function end(event: PointerEvent) {
      if (event.pointerId !== pointer.current) return;
      pointer.current = null;
      dispatchSurface({ type: "gesture-end" });
    }
    window.addEventListener("phone-page-gesture", start);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    return () => {
      window.removeEventListener("phone-page-gesture", start);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
    };
  }, [trayWanted]);

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
      dispatchSurface({ type: "open-menu", id });
      openPanel("tools");
    } else {
      dispatchSurface({ type: "open-menu", id });
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
    dispatchSurface({ type: "pick-tool" });
    onPick(representedTool(slot));
    if (panel === "tools") closePanel();
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
            } else if (pressed && !open) {
              dispatchSurface({ type: "tap-active-tool" });
            } else {
              dispatchSurface({ type: "pick-tool" });
              onPick(represented);
              if (open) closeMenu();
            }
          }}
          className={`${KEY_STYLE} rounded-[13px] ${pressed ? "bg-action text-on-action" : ""} ${group ? GROUP_TICK : ""}`}
        >
          <Icon className="size-[22px]" aria-hidden="true" />
        </button>
        {group && surface === id && (
          <PhoneToolMenu
            label={group.name}
            open={open === id}
            alignStart
            rows={group.tools.map((member) => TOOL_INFO[member])}
            checked={tool}
            onPick={(index) => {
              const member = group.tools[index];
              if (!member) return;
              dispatchSurface({ type: "pick-tool" });
              onPick(member);
              if (panel === "tools") closePanel();
            }}
          />
        )}
      </div>
    );
  }

  const fade = "motion-safe:transition-opacity duration-(--duration-exit)";
  const visibility = phoneSurface.seeThrough ? "pointer-events-none opacity-20" : "";
  const moreOpen = open === "more";
  const scrimState = open
    ? "opacity-100 duration-(--duration-enter)"
    : "pointer-events-none opacity-0 duration-(--duration-exit)";
  return (
    <>
      {surface === "tray" && (phoneSurface.trayCollapsed || draggingSignature) && (
        <button
          ref={chipRef}
          type="button"
          inert={wanted !== "tray"}
          aria-expanded={false}
          onClick={() => dispatchSurface({ type: "expand" })}
          className={`absolute bottom-[calc(var(--space-3)+56px)] left-1/2 z-4 flex h-11 -translate-x-1/2 items-center ${fade} ${visibility}`}
        >
          <span
            className={`flex h-9 items-center gap-2 rounded-xs bg-raised px-3 shadow-[0_10px_28px_-10px_rgb(var(--shadow-rgb)/38%),0_2px_6px_-2px_rgb(var(--shadow-rgb)/18%)] ring-1 ring-ink/9 ${PHONE_SURFACE_MOTION}`}
          >
            <span className="sr-only">Expand </span>
            {selected && !hasDraft ? (
              <SelectedMarkName selected={selected} chip />
            ) : (
              <>
                <span className="sr-only">{hasDraft ? "Text" : TOOL_INFO[tool].label} tool card</span>
                {color && <span className="size-3 rounded-full" style={{ backgroundColor: colorHex(color) }} />}
                {value != null && <span>{value} pt</span>}
              </>
            )}
            <ChevronUp
              aria-hidden="true"
              className="size-4 transition-transform duration-(--duration-enter) ease-out motion-reduce:transition-none"
            />
          </span>
        </button>
      )}
      {surface === "tray" && !phoneSurface.trayCollapsed && (
        <section
          hidden={draggingSignature}
          style={draggingSignature ? { display: "none" } : undefined}
          ref={trayRef}
          key={card}
          aria-labelledby={trayTitleId}
          aria-hidden={wanted !== "tray"}
          inert={wanted !== "tray"}
          data-closed={wanted === "tray" ? undefined : true}
          className={TRAY_STYLE}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id={trayTitleId} className="flex-1 font-hand text-md/[1.1]">
              {hasDraft ? "Text" : selected ? <SelectedMarkName selected={selected} /> : TOOL_INFO[tool].label}
            </h2>
            <button
              type="button"
              aria-label="Collapse options"
              aria-expanded={true}
              className="grid size-11 shrink-0 touch-manipulation place-items-center rounded-full text-muted hover:bg-hover"
              onClick={() => dispatchSurface({ type: "collapse" })}
            >
              <ChevronDown aria-hidden="true" className="size-5" />
            </button>
          </div>
          <PropertiesPanel hideHeading />
        </section>
      )}
      <div
        aria-hidden="true"
        onClick={closeMenu}
        className={`absolute inset-0 z-5 bg-canvas/55 transition-opacity ease-out ${scrimState}`}
      />
      <div ref={barRef} role="toolbar" aria-label="Tools" className={`${BAR_STYLE} ${fade} ${visibility}`}>
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
        {surface === "more" && (
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
        )}
      </div>
    </>
  );
}
