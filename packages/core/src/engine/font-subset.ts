import subsetUrl from "harfbuzzjs/dist/harfbuzz-subset.wasm?url";
import { canSubsetFont, fontTable, missingFontCharacter } from "../page-text/sfnt";

type SubsetWasm = {
  memory: WebAssembly.Memory;
  _initialize(): void;
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(...args: number[]): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_length(blob: number): number;
  hb_blob_get_data(blob: number, length: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_unicode_set(input: number): number;
  hb_set_add(set: number, codepoint: number): void;
  hb_subset_input_pin_all_axes_to_default(input: number, face: number): number;
  hb_subset_input_pin_axis_location(input: number, face: number, tag: number, value: number): number;
  hb_subset_or_fail(face: number, input: number): number;
};

let pending: Promise<SubsetWasm> | undefined;

/**
 * Loads the subset engine on demand, sharing concurrent initialization.
 * @returns The initialized subset engine.
 */
export async function subsetEngine(): Promise<SubsetWasm> {
  pending ??= (async () => {
    const { instance } = await WebAssembly.instantiate(
      await fetch(
        subsetUrl.startsWith("/") && typeof location === "undefined" ? `file://${subsetUrl}` : subsetUrl,
      ).then((response) => response.arrayBuffer()),
    );
    const wasm = { ...instance.exports } as unknown as SubsetWasm;
    wasm._initialize();
    return wasm;
  })().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

/**
 * Reads the clamped requested weight from the variable font's axis range.
 * @param bytes The source font.
 * @param weight The requested weight.
 * @returns The pinned weight, if the font has a weight axis.
 */
function pinnedWeight(bytes: ArrayBuffer, weight: number): number | undefined {
  const fvar = fontTable(bytes, "fvar");
  if (!fvar || fvar.byteLength < 16) return;
  const first = fvar.getUint16(4);
  const count = fvar.getUint16(8);
  const size = fvar.getUint16(10);
  for (let index = 0; size >= 20 && index < count; index++) {
    const axis = first + index * size;
    if (axis + size > fvar.byteLength) return;
    if (fvar.getUint32(axis) !== 0x77676874) continue;
    return Math.min(fvar.getInt32(axis + 12) / 65536, Math.max(weight, fvar.getInt32(axis + 4) / 65536));
  }
}

/**
 * Subsets a TrueType font to the block's NFC text and space, instancing its variation axes.
 * @param bytes The original font bytes.
 * @param text The block text.
 * @param weight The desired font weight.
 * @returns A static font suitable for loading in PDFium.
 */
export async function subsetFont(bytes: ArrayBuffer, text: string, weight: number): Promise<ArrayBuffer> {
  const characters = text.normalize("NFC") + " ";
  if (!canSubsetFont(bytes) || !fontTable(bytes, "glyf") || missingFontCharacter(bytes, characters)) {
    throw new Error("The font cannot be embedded for this text.");
  }
  const wasm = await subsetEngine();
  const ptr = wasm.malloc(bytes.byteLength);
  if (!ptr) throw new Error("Could not allocate the font buffer.");
  try {
    new Uint8Array(wasm.memory.buffer, ptr, bytes.byteLength).set(new Uint8Array(bytes));
    const blob = wasm.hb_blob_create(ptr, bytes.byteLength, 1, 0, 0);
    try {
      const face = wasm.hb_face_create(blob, 0);
      try {
        return subsetFace(wasm, face, characters, pinnedWeight(bytes, weight));
      } finally {
        wasm.hb_face_destroy(face);
      }
    } finally {
      wasm.hb_blob_destroy(blob);
    }
  } finally {
    wasm.free(ptr);
  }
}

/**
 * Sets the character set and axes, then copies the resulting font out of wasm.
 * @param wasm The subset engine.
 * @param face The source face.
 * @param characters The Unicode characters to preserve.
 * @param weight The clamped weight, if variable.
 * @returns The subset bytes.
 */
function subsetFace(wasm: SubsetWasm, face: number, characters: string, weight?: number): ArrayBuffer {
  const input = wasm.hb_subset_input_create_or_fail();
  if (!input) throw new Error("Could not allocate subset input.");
  try {
    const set = wasm.hb_subset_input_unicode_set(input);
    for (const character of characters) wasm.hb_set_add(set, character.codePointAt(0)!);
    wasm.hb_subset_input_pin_all_axes_to_default(input, face);
    if (weight !== undefined && !wasm.hb_subset_input_pin_axis_location(input, face, 0x77676874, weight)) {
      throw new Error("Could not pin font weight.");
    }
    const result = wasm.hb_subset_or_fail(face, input);
    if (!result) throw new Error("Could not subset font.");
    try {
      const blob = wasm.hb_face_reference_blob(result);
      try {
        const length = wasm.hb_blob_get_length(blob);
        const data = wasm.hb_blob_get_data(blob, 0);
        if (!length || !data) throw new Error("Font subset is empty.");
        return new Uint8Array(wasm.memory.buffer, data, length).slice().buffer;
      } finally {
        wasm.hb_blob_destroy(blob);
      }
    } finally {
      wasm.hb_face_destroy(result);
    }
  } finally {
    wasm.hb_subset_input_destroy(input);
  }
}
