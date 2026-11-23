import {
  canEmbedLocalFont,
  canSubsetFont,
  missingFontCharacter,
  validFontBytes,
  type DocumentSession,
  type PageFont,
  type TextRunFamily,
  type TextRunFont,
} from "@pdf-editor/core";
import inter from "../../assets/fonts/inter.ttf?url";
import interItalic from "../../assets/fonts/inter-italic.ttf?url";
import jetBrains from "../../assets/fonts/jet-brains-mono.ttf?url";
import jetBrainsItalic from "../../assets/fonts/jet-brains-mono-italic.ttf?url";
import lora from "../../assets/fonts/lora.ttf?url";
import loraItalic from "../../assets/fonts/lora-italic.ttf?url";
import nunito from "../../assets/fonts/nunito.ttf?url";
import nunitoItalic from "../../assets/fonts/nunito-italic.ttf?url";
import playpen from "../../assets/fonts/playpen-sans.ttf?url";

export const BUNDLED_FONTS = [
  { id: "inter", name: "Inter", normal: inter, italic: interItalic },
  { id: "lora", name: "Lora", normal: lora, italic: loraItalic },
  { id: "jet-brains-mono", name: "JetBrains Mono", normal: jetBrains, italic: jetBrainsItalic },
  { id: "playpen-sans", name: "Playpen Sans", normal: playpen, italic: undefined },
  { id: "nunito", name: "Nunito", normal: nunito, italic: nunitoItalic },
] as const;

export interface FontChoice {
  readonly id: string;
  readonly name: string;
  readonly bundledId: string;
  readonly standard?: TextRunFamily;
  readonly preview?: string;
  readonly document?: PageFont;
  readonly local?:
    | {
        readonly kind: "device";
        /** @returns The bytes of the installed face. */
        read(): Promise<ArrayBuffer>;
      }
    | { readonly kind: "file"; readonly bytes: ArrayBuffer };
}

interface FontRow {
  readonly font: FontChoice;
  readonly blocked: boolean;
  readonly missing?: string;
}

const RECENT_KEY = "trangpdf.recent-text-fonts";
const assets = new Map<string, Promise<ArrayBuffer>>();
const loadedBytes = new Map<string, ArrayBuffer>();
const localFaces = new Map<string, { name: string; face: FontFace }>();
interface DocumentFace {
  readonly choice: FontChoice;
  readonly face: FontFace;
  readonly pageId: string;
  readonly session: DocumentSession;
  unsubscribe(): void;
}

const choices = new Map<string, DocumentFace>();

const sessionIds = new WeakMap<DocumentSession, number>();
let nextSessionId = 0;

/**
 * Generates a CSS-safe preview id scoped to a page and editing session.
 * @param session The editor tab that owns the page.
 * @param pageId The page containing the face.
 * @param fontId The font identifier within the page.
 * @returns The stable browser family id for the document face.
 */
export function documentChoiceId(session: DocumentSession, pageId: string, fontId: string): string {
  let id = sessionIds.get(session);
  if (id === undefined) {
    id = nextSessionId++;
    sessionIds.set(session, id);
  }
  return `document-${id}-${pageId.replace(/[^a-zA-Z0-9-]/g, "-")}-${fontId}`;
}

/**
 * Removes an activated page font from the browser.
 * @param id The activated family id.
 * @returns Nothing.
 */
export function releaseDocumentFont(id: string | undefined): void {
  const entry = choices.get(id ?? "");
  if (!id || !entry) return;
  entry.unsubscribe();
  document.fonts.delete(entry.face);
  choices.delete(id);
}

/**
 * Resolves a preset selected on another page to a bundled look-alike.
 * @param id The authored family id.
 * @param pageId The destination page.
 * @param session The editing session for that page.
 * @returns The authored family or a bundled replacement.
 */
export function fontChoiceOnPage(id: string | undefined, pageId: string, session: DocumentSession): string | undefined {
  const entry = choices.get(id ?? "");
  return entry && (entry.pageId !== pageId || entry.session !== session) ? entry.choice.bundledId : id;
}

/**
 * Releases browser faces that were attached to a completed or abandoned draft.
 * @param pageId The draft's page.
 * @param session The draft’s editing session.
 * @param preserve A face still chosen as the tool preset.
 * @returns Nothing.
 */
export function releaseDocumentFonts(pageId: string, session: DocumentSession, preserve?: string): void {
  for (const [id, entry] of choices) {
    if (entry.pageId === pageId && entry.session === session && id !== preserve) releaseDocumentFont(id);
  }
}

/**
 * Retrieves the display name and CSS family for an authored font choice.
 * @param id The chosen face, if any.
 * @returns The visible font name and browser family.
 */
export function chosenFont(id: string | null | undefined) {
  const name =
    localFaces.get(id ?? "")?.name ??
    choices.get(id ?? "")?.choice.name ??
    BUNDLED_FONTS.find((font) => font.id === id)?.name;
  return id && name ? { name, css: `pdf-face-${id}` } : null;
}

/**
 * Loads an on-demand font asset and retains its bytes for a later worker transfer.
 * @param id The stable bundled family id.
 * @param italic Whether the italic face is wanted.
 * @returns The original font bytes and the concrete file id.
 */
export async function loadBundledFont(id: string, italic = false) {
  const family = BUNDLED_FONTS.find((font) => font.id === id);
  if (!family) throw new Error("Unknown bundled font.");
  const useItalic = italic && !!family.italic;
  const fontId = `bundled:${id}:${useItalic ? "italic" : "regular"}`;
  let asset = assets.get(fontId);
  if (!asset) {
    asset = (async () => {
      const response = await fetch(useItalic ? family.italic! : family.normal);
      if (!response.ok) throw new Error("Could not load the font.");
      const bytes = await response.arrayBuffer();
      const face = new FontFace(`pdf-face-${id}`, bytes, {
        weight: "100 900",
        style: useItalic ? "italic" : "normal",
      });
      await face.load();
      document.fonts.add(face);
      loadedBytes.set(fontId, bytes);
      return bytes;
    })();
    assets.set(fontId, asset);
    void asset.catch(() => assets.delete(fontId));
  }
  return { fontId, bytes: await asset };
}

/**
 * Reads registered browser font bytes for a worker registration.
 * @param fontId The concrete bundled file id.
 * @returns The cached font bytes.
 */
export function bundledFontBytes(fontId: string): ArrayBuffer | undefined {
  return loadedBytes.get(fontId);
}

/**
 * Builds a run reference from the Lexical family and built-in format flags.
 * @param id The authored family id.
 * @param bold Whether the run is bold.
 * @param italic Whether the run is italic.
 * @param originalStyle Whether to use the source face’s exact variant for a glyph fallback.
 * @returns Its worker reference, if known.
 */
export function embeddedRunFont(
  id: string | undefined,
  bold: boolean,
  italic: boolean,
  originalStyle = false,
): TextRunFont | undefined {
  const local = localFaces.get(id ?? "");
  if (id && local) {
    return { kind: "embedded", fontId: id, name: local.name, weight: bold ? 700 : 400, italic };
  }
  const choice = choices.get(id ?? "")?.choice;
  const family = BUNDLED_FONTS.find((item) => item.id === (choice?.bundledId ?? id));
  if (!family) return;
  const source = originalStyle ? choice?.document?.style : undefined;
  const slanted = source?.italic ?? italic;
  return {
    kind: "embedded",
    fontId: `bundled:${family.id}:${slanted && family.italic ? "italic" : "regular"}`,
    name: choice?.name ?? family.name,
    weight: (source?.bold ?? bold) ? 700 : 400,
    italic: slanted,
    ...(choice?.document && { documentFontId: choice.document.id }),
  };
}

/**
 * Finds a usable document face that covers the block and can be used as a glyph fallback.
 * @param fonts The current page's fonts with browser preview state.
 * @param text All characters in the draft.
 * @returns The first eligible face, if any.
 */
export function documentFallback(fonts: readonly FontChoice[], text: string): FontChoice | undefined {
  return fonts.find(
    ({ document, preview }) =>
      document?.bytes && preview && canSubsetFont(document.bytes) && !missingFontCharacter(document.bytes, text + " "),
  );
}

/**
 * Reads a local face once and validates its actual embedding bytes.
 * @param choice The local row.
 * @param session The session providing worker-side font validation.
 * @returns The decoded font bytes.
 */
export async function readLocalFont(choice: FontChoice, session: DocumentSession): Promise<ArrayBuffer> {
  const local = choice.local;
  if (local?.kind === "file") return local.bytes;
  if (!local) throw new Error("The local font is unavailable.");
  let asset = assets.get(choice.id);
  if (!asset) {
    asset = local
      .read()
      .then((bytes) => session.prepareFont(bytes))
      .then((bytes) => {
        loadedBytes.set(choice.id, bytes);
        return bytes;
      });
    assets.set(choice.id, asset);
    void asset.catch(() => assets.delete(choice.id));
  }
  return asset;
}

/**
 * Activates the local face and registers it before it can be applied to a block.
 * @param choice The local row.
 * @param bytes The validated font bytes.
 * @param activation The target session, page and cancellation signal.
 * @returns The browser family id.
 */
export async function activateLocalFont(
  choice: FontChoice,
  bytes: ArrayBuffer,
  activation: { pageId: string; session: DocumentSession; signal: AbortSignal },
): Promise<string> {
  const { id, name } = choice;
  const { pageId, session, signal } = activation;
  let face = localFaces.get(id)?.face;
  face ??= await new FontFace(`pdf-face-${id}`, bytes).load();
  signal.throwIfAborted();
  if (pageId) await session.registerTextFont(pageId, id, bytes);
  signal.throwIfAborted();
  document.fonts.add(face);
  localFaces.set(id, { name, face });
  loadedBytes.set(id, bytes);
  return id;
}

/**
 * Drops the browser face and cached bytes for a removed font file.
 * @param id The removed font file id.
 * @returns Nothing.
 */
export function releaseFontFile(id: string): void {
  const local = localFaces.get(id);
  if (local) document.fonts.delete(local.face);
  localFaces.delete(id);
  loadedBytes.delete(id);
}

/**
 * Loads the chosen browser face before applying it to the draft.
 * @param choice The selected row.
 * @param useDocument Whether the document face covers the selection.
 * @param activation The draft owner and cancellation when the picker closes.
 * @returns The CSS family id to apply.
 */
export async function activateFont(
  choice: FontChoice,
  useDocument: boolean,
  activation: { pageId: string; session: DocumentSession; signal: AbortSignal },
): Promise<string> {
  const { pageId, session, signal } = activation;
  const id = useDocument ? choice.id : choice.bundledId;
  await Promise.all([loadBundledFont(choice.bundledId), loadBundledFont(choice.bundledId, true)]);
  signal.throwIfAborted();
  if (!pageId || !useDocument || !choice.document?.bytes) return choice.bundledId;
  if (choices.has(id)) return id;
  const face = new FontFace(`pdf-face-${id}`, choice.document.bytes, {
    weight: choice.document.style.bold ? "700" : "400",
    style: choice.document.style.italic ? "italic" : "normal",
  });
  await face.load();
  signal.throwIfAborted();
  document.fonts.add(face);
  const unsubscribe = session.store.subscribe(({ pages }) => {
    if (!pages.some(({ id }) => id === pageId)) releaseDocumentFont(id);
  });
  choices.set(id, {
    choice: { ...choice, document: { ...choice.document, bytes: undefined } },
    face,
    pageId,
    session,
    unsubscribe,
  });
  return id;
}

/**
 * Reads the last five bundled font ids from local storage.
 * @returns Recent choices ordered most recent first.
 */
export function recentFonts(): FontChoice[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.slice(0, 5).flatMap((entry) => {
      const font = BUNDLED_FONTS.find(({ id }) => id === entry?.id);
      return font ? [{ id: font.id, name: font.name, bundledId: font.id }] : [];
    });
  } catch {
    return [];
  }
}

/**
 * Records a bundled choice without persisting document information.
 * @param choice The selected font.
 * @returns Nothing.
 */
export function rememberFont(choice: FontChoice): void {
  if (choice.document || choice.local) return;
  const recent = [choice, ...recentFonts().filter(({ id }) => id !== choice.id)].slice(0, 5);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.map(({ id, name }) => ({ id, name }))));
  } catch {
    // The picker is also usable with storage disabled.
  }
}

/**
 * Groups font choices and computes coverage and embedding flags.
 * @param page The current page's document faces.
 * @param recent The last bundled choices.
 * @param query The case-insensitive name filter.
 * @param selection The current sample and italic state.
 * @returns Rows grouped in picker order.
 */
export function fontSections(
  page: readonly FontChoice[],
  recent: readonly FontChoice[],
  query: string,
  selection: { text: string; italic: boolean; device?: readonly FontChoice[]; files?: readonly FontChoice[] },
) {
  const bundled: FontChoice[] = BUNDLED_FONTS.map(({ id, name }) => ({ id, name, bundledId: id }));
  const standard: FontChoice[] = [
    { id: "Helvetica", name: "Sans", bundledId: "inter", standard: "Helvetica" },
    { id: "Times", name: "Serif", bundledId: "lora", standard: "Times" },
    { id: "Courier", name: "Mono", bundledId: "jet-brains-mono", standard: "Courier" },
  ];
  const sections = [
    { title: "In this PDF", fonts: page },
    { title: "Recent", fonts: recent },
    { title: "Comes with TrangPDF", fonts: bundled },
    { title: "Standard PDF fonts", fonts: standard },
    ...(selection.device ? [{ title: "On this device", fonts: selection.device }] : []),
    ...(selection.files ? [{ title: "Your font files", fonts: selection.files }] : []),
  ];
  return sections.map(({ title, fonts }) => ({
    title,
    rows: fonts
      .filter(({ name }) => name.toLowerCase().includes(query.trim().toLowerCase()))
      .map((font): FontRow => {
        const reference = embeddedRunFont(font.bundledId, false, selection.italic);
        const bytes =
          font.local?.kind === "file"
            ? font.local.bytes
            : font.local
              ? bundledFontBytes(font.id)
              : font.document
                ? font.document.bytes
                : reference?.kind === "embedded"
                  ? bundledFontBytes(reference.fontId)
                  : undefined;
        const blocked =
          !!bytes && (font.local ? !validFontBytes(bytes) || !canEmbedLocalFont(bytes) : !canSubsetFont(bytes));
        const missing = bytes && !blocked ? missingFontCharacter(bytes, selection.text) : undefined;
        return {
          font,
          blocked,
          missing: missing ?? (font.document && !bytes ? [...selection.text][0] : undefined),
        };
      }),
  }));
}
