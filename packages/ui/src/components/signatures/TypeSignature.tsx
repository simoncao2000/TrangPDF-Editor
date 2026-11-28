import { useEffect, useId, useRef, useState } from "react";
import { useProfile } from "../../state/profile-store";
import type { SignatureStyle, TypedSignature } from "../../state/signature-store";
import { Button } from "../primitives/Button";
import { SIGNATURE_INKS, SIGNATURE_STYLES } from "./typed-signature";

const STYLES = Object.keys(SIGNATURE_STYLES) as SignatureStyle[];
interface TypeSignatureProps {
  readonly onCancel: () => void;
  readonly onUse: (signature: TypedSignature, save: boolean) => void;
}

/**
 * Edits and previews a typed signature before accepting it.
 * @param props Cancel and use handlers.
 * @returns The typed signature editor.
 */
export function TypeSignature({ onCancel, onUse }: TypeSignatureProps) {
  const profileName = useProfile((state) => state.name);
  const [name, setName] = useState(profileName);
  const [style, setStyle] = useState<SignatureStyle>("flowing");
  const [ink, setInk] = useState<TypedSignature["ink"]>("black");
  const [save, setSave] = useState(true);
  const group = useId();
  const input = useRef<HTMLInputElement>(null);
  const text = name.trim();

  useEffect(() => {
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", revealName);
    return () => viewport?.removeEventListener("resize", revealName);
  }, []);

  /**
   * Keeps the focused name field visible when the phone keyboard opens.
   * @returns Nothing.
   */
  function revealName() {
    if (input.current === document.activeElement) input.current?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="grid gap-3">
      <input
        ref={input}
        type="text"
        aria-label="Your name"
        placeholder="Your name"
        autoComplete="name"
        value={name}
        onFocus={revealName}
        onChange={(event) => setName(event.target.value)}
        className="h-11 min-w-0 rounded-xs border border-line bg-surface px-3 text-base text-ink placeholder:text-muted focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      />
      <div className="relative grid h-42 min-w-0 place-items-center rounded-lg bg-paper-field ring-1 ring-paper-rule">
        <span
          aria-hidden="true"
          className="absolute bottom-10.5 left-7 font-serif text-lg leading-none text-paper-muted"
        >
          ×
        </span>
        <span aria-hidden="true" className="absolute inset-x-7 bottom-9.5 h-px bg-paper-line" />
        <span
          aria-hidden="true"
          className="z-10 max-w-[82%] -translate-y-1.5 truncate px-1 text-[2.5rem] leading-[1.1] sm:text-[3.25rem]"
          style={{ fontFamily: SIGNATURE_STYLES[style].family, color: SIGNATURE_INKS[ink] }}
        >
          {text}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label="Signature style"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        style={{ containerType: "inline-size" }}
      >
        {STYLES.map((option) => (
          <label key={option} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name={group}
              aria-label={SIGNATURE_STYLES[option].label}
              checked={style === option}
              onChange={() => setStyle(option)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="flex h-14.5 items-center justify-center rounded-md bg-paper-field px-2 text-[1.1875rem] text-paper-ink ring-1 ring-paper-rule transition-transform peer-checked:ring-2 peer-checked:ring-signal peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus active:scale-[0.97]"
              style={{ fontFamily: SIGNATURE_STYLES[option].family }}
            >
              <span className="min-w-0 px-1" style={{ fontSize: "min(1.1875rem, calc((100cqw - 1rem) / 8))" }}>
                {text || SIGNATURE_STYLES[option].label}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">Ink</span>
          <div role="radiogroup" aria-label="Ink" className="flex items-center gap-3">
            {(["black", "blue"] as const).map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name={`${group}-ink`}
                  aria-label={option === "black" ? "Black" : "Blue"}
                  checked={ink === option}
                  onChange={() => setInk(option)}
                  className="size-4 accent-signal"
                />
                <span
                  aria-hidden="true"
                  className="size-4 rounded-full ring-1 ring-line"
                  style={{ backgroundColor: SIGNATURE_INKS[option] }}
                />
                <span>{option === "black" ? "Black" : "Blue"}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={save}
            onChange={(event) => setSave(event.target.checked)}
            className="size-4 accent-signal"
          />
          Save to this device for next time
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!text}
          onClick={() => onUse({ id: crypto.randomUUID(), kind: "typed", text, style, ink }, save)}
        >
          Use signature
        </Button>
      </div>
    </div>
  );
}
