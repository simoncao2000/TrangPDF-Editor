/**
 * Short confirmations after an action ("Page 5 deleted · Undo"). One at a time: a new toast replaces
 * the old one, which is what you want when actions happen quickly.
 */
import { create } from "zustand";

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: "neutral" | "error";
  /** The one follow-up, usually Undo. */
  readonly action?: { readonly label: string; readonly run: () => void };
}

/** How long a toast stays, unless the pointer is over it. */
export const TOAST_MS = 5000;

interface ToastState {
  readonly toast: Toast | null;
  show(message: string, options?: { tone?: Toast["tone"]; action?: Toast["action"] }): void;
  dismiss(id?: number): void;
}

let nextId = 1;

export const useToast = create<ToastState>((set, get) => ({
  toast: null,
  show: (message, options = {}) => set({ toast: { id: nextId++, message, tone: options.tone ?? "neutral", action: options.action } }),
  dismiss: (id) => {
    if (id === undefined || get().toast?.id === id) set({ toast: null });
  },
}));
