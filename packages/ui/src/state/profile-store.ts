/**
 * Who is using the editor on this device: the name comments are signed with. Asked the first time
 * someone comments and kept in local storage; never leaves the device except inside saved PDFs.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface ProfileState {
  /** "" until it has been asked for. */
  readonly name: string;
  setName(name: string): void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      name: "",
      setName: (name) => set({ name: name.trim() }),
    }),
    {
      name: "trangpdf-profile",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ name }) => ({ name }),
    },
  ),
);
