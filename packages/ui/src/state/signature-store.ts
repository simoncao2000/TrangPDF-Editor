/**
 * Signatures drawn on this device, kept in local storage to sign again. Each is a set of strokes in
 * its own box (0–1 wide, 0–`aspect` high, y down), so it can be placed at any size.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface SavedSignature {
  readonly id: string;
  /** Strokes, each a list of points, x from 0 to 1 and y from 0 to `aspect`, y going down. */
  readonly strokes: readonly (readonly { readonly x: number; readonly y: number }[])[];
  /** Height divided by width. */
  readonly aspect: number;
}

export interface SignatureState {
  readonly signatures: readonly SavedSignature[];
  /** The signature the Sign tool places; `null` when there is none yet. */
  readonly currentId: string | null;
  /** The drawing pad is open. */
  readonly drawing: boolean;
  setDrawing(drawing: boolean): void;
  add(signature: SavedSignature): void;
  remove(id: string): void;
  choose(id: string): void;
}

export const useSignatures = create<SignatureState>()(
  persist(
    (set) => ({
      signatures: [],
      currentId: null,
      drawing: false,
      setDrawing: (drawing) => set({ drawing }),
      add: (signature) => set((state) => ({ signatures: [...state.signatures, signature], currentId: signature.id })),
      remove: (id) =>
        set((state) => {
          const signatures = state.signatures.filter((signature) => signature.id !== id);
          return { signatures, currentId: state.currentId === id ? (signatures.at(-1)?.id ?? null) : state.currentId };
        }),
      choose: (currentId) => set({ currentId }),
    }),
    {
      name: "trangpdf-signatures",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ signatures, currentId }) => ({ signatures, currentId }),
    },
  ),
);
