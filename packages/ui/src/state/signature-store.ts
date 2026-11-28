/**
 * Signatures created on this device, kept in local storage to sign again. Each is a set of strokes in
 * its own box (0–1 wide, 0–`aspect` high, y down), so it can be placed at any size.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface DrawnSignature {
  readonly kind: "drawn";
  readonly id: string;
  /** Strokes, each a list of points, x from 0 to 1 and y from 0 to `aspect`, y going down. */
  readonly strokes: readonly (readonly { readonly x: number; readonly y: number }[])[];
  /** Height divided by width. */
  readonly aspect: number;
}

export type SignatureStyle = "flowing" | "classic" | "casual" | "rounded";
export type SignatureInk = "black" | "blue";

export interface TypedSignature {
  readonly kind: "typed";
  readonly id: string;
  readonly text: string;
  readonly style: SignatureStyle;
  readonly ink: SignatureInk;
}

export type SavedSignature = DrawnSignature | TypedSignature;

interface PersistedSignatures {
  readonly signatures: readonly SavedSignature[];
  readonly currentId: string | null;
  readonly lastMode: SavedSignature["kind"];
}

type LegacySignatures = Omit<PersistedSignatures, "lastMode" | "signatures"> & {
  readonly signatures: readonly Omit<DrawnSignature, "kind">[];
};

type SetLastMode = (lastMode: SavedSignature["kind"]) => void;

/**
 * Adds the discriminator to drawn signatures from the original storage format.
 * @param state The version-one persisted data.
 * @returns The current persisted format with the previous selection intact.
 */
export function migrateSignatures(state: unknown): PersistedSignatures {
  const persisted = state && typeof state === "object" ? (state as Partial<LegacySignatures>) : {};
  const signatures = Array.isArray(persisted.signatures) ? persisted.signatures : [];
  return {
    signatures: signatures.map((signature) => ({ ...signature, kind: "drawn" })),
    currentId: typeof persisted.currentId === "string" ? persisted.currentId : null,
    lastMode: "drawn",
  };
}

export interface SignatureState extends PersistedSignatures {
  readonly temporary: TypedSignature | null;
  /** The drawing pad is open. */
  readonly drawing: boolean;
  setDrawing(drawing: boolean): void;
  add(signature: SavedSignature): void;
  setLastMode: SetLastMode;
  setTemporary(signature: TypedSignature): void;
  remove(id: string): void;
  choose(id: string): void;
}

export const useSignatures = create<SignatureState>()(
  persist(
    (set) => ({
      signatures: [],
      currentId: null,
      drawing: false,
      lastMode: "drawn",
      temporary: null,
      setDrawing: (drawing) => set({ drawing }),
      setLastMode: (lastMode) => set({ lastMode }),
      add: (signature) =>
        set((state) => ({
          signatures: [...state.signatures, signature],
          currentId: signature.id,
          lastMode: signature.kind,
          temporary: null,
        })),
      setTemporary: (temporary) => set({ temporary }),
      remove: (id) =>
        set((state) => {
          const signatures = state.signatures.filter((signature) => signature.id !== id);
          return { signatures, currentId: state.currentId === id ? (signatures.at(-1)?.id ?? null) : state.currentId };
        }),
      choose: (currentId) => set({ currentId, temporary: null }),
    }),
    {
      name: "trangpdf-signatures",
      version: 2,
      migrate: migrateSignatures,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ signatures, currentId, lastMode }) => ({
        signatures,
        currentId,
        lastMode,
      }),
    },
  ),
);
