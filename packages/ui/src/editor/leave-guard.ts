/**
 * Holds an action (close, open another file) that is waiting for the user to decide what to do with
 * unsaved changes. The UnsavedChangesDialog reads it.
 */
import { create } from "zustand";

interface LeaveGuardState {
  readonly pending: (() => void) | null;
  ask(action: () => void): void;
  clear(): void;
}

export const useLeaveGuard = create<LeaveGuardState>((set) => ({
  pending: null,
  ask: (action) => set({ pending: action }),
  clear: () => set({ pending: null }),
}));
