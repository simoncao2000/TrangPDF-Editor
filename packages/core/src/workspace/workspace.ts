/**
 * The open documents, one per tab (like editors in VS Code). Each tab has its own document session,
 * so its pages, undo history and unsaved changes are its own; they all share one engine worker and
 * one page renderer. Never imports React or a platform.
 */
import type { OpenedFile } from "@pdf-editor/shared";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { DocumentSession } from "../document/document-session";

export interface Tab {
  readonly id: string;
  readonly session: DocumentSession;
}

export interface WorkspaceState {
  /** Open tabs, in the order they are shown. */
  readonly tabs: readonly Tab[];
  /** The tab in front, or `null` when nothing is open. */
  readonly activeId: string | null;
}

export interface Workspace {
  /** Subscribe with zustand's `useStore(workspace.store, selector)` in React. */
  readonly store: StoreApi<WorkspaceState>;
  /**
   * Opens a file in a new tab and brings it to the front. A file that is already open (same
   * platform file id) is brought to the front instead of being opened twice.
   * @param file The file from a FileAdapter. Its bytes are moved to the worker.
   * @returns The tab, once the file is open, waiting for a password, or failed.
   */
  open(file: OpenedFile): Promise<Tab>;
  /**
   * Brings a tab to the front.
   * @param tabId A tab id; unknown ids are ignored.
   */
  activate(tabId: string): void;
  /**
   * Closes a tab and its document. The tab to its right (or else left) comes to the front. Ask about
   * unsaved changes first.
   * @param tabId A tab id; unknown ids are ignored.
   */
  close(tabId: string): Promise<void>;
  /**
   * The session of the tab in front.
   * @returns It, or an idle empty session when no tab is open.
   */
  activeSession(): DocumentSession;
  /**
   * Whether any open document has unsaved changes.
   * @returns True if a tab is dirty or saving.
   */
  hasUnsavedChanges(): boolean;
}

/**
 * Creates a workspace.
 * @param createSession Makes a new, empty document session (one per tab).
 * @returns The workspace, with no tabs open.
 */
export function createWorkspace(createSession: () => DocumentSession): Workspace {
  const store = createStore<WorkspaceState>(() => ({ tabs: [], activeId: null }));
  /** Stands in when nothing is open, so the UI always has a session to read. */
  const idle = createSession();
  let nextTab = 1;

  const findOpen = (fileId: string | undefined): Tab | undefined =>
    fileId ? store.getState().tabs.find((tab) => tab.session.store.getState().fileId === fileId) : undefined;

  return {
    store,

    async open(file) {
      const existing = findOpen(file.fileId);
      if (existing) {
        store.setState({ activeId: existing.id });
        return existing;
      }
      const tab: Tab = { id: `tab-${nextTab++}`, session: createSession() };
      store.setState((state) => ({ tabs: [...state.tabs, tab], activeId: tab.id }));
      await tab.session.load(file);
      return tab;
    },

    activate(tabId) {
      if (store.getState().tabs.some((tab) => tab.id === tabId)) store.setState({ activeId: tabId });
    },

    async close(tabId) {
      const { tabs, activeId } = store.getState();
      const index = tabs.findIndex((tab) => tab.id === tabId);
      if (index === -1) return;
      const remaining = tabs.filter((tab) => tab.id !== tabId);
      const neighbour = remaining[index] ?? remaining[index - 1] ?? null;
      store.setState({ tabs: remaining, activeId: activeId === tabId ? (neighbour?.id ?? null) : activeId });
      await tabs[index]!.session.close();
    },

    activeSession() {
      const { tabs, activeId } = store.getState();
      return tabs.find((tab) => tab.id === activeId)?.session ?? idle;
    },

    hasUnsavedChanges() {
      return store.getState().tabs.some((tab) => {
        const { status } = tab.session.store.getState();
        return status === "dirty" || status === "saving";
      });
    },
  };
}
