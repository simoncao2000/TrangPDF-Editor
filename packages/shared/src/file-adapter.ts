/** A file the user chose, read into memory. */
export interface OpenedFile {
  /** Display name including the extension, e.g. "Coastal Fieldbook.pdf". */
  readonly name: string;
  readonly bytes: ArrayBuffer;
  /** The platform's id for this file: used for the recent list and to save in place. */
  readonly fileId?: string;
}

/** Where a file was written. */
export interface SavedFile {
  readonly name: string;
  /** Set when the platform can write to the same file again (save in place). */
  readonly fileId?: string;
}

/** An entry in the recent files list. */
export interface RecentFile {
  readonly id: string;
  readonly name: string;
  /** Epoch milliseconds. */
  readonly openedAt: number;
  readonly pageCount: number;
  /** False when the platform kept only the name (e.g. a browser without file handles). */
  readonly canReopen: boolean;
}

/**
 * File access for one platform (web, Tauri, Capacitor). Implementations live in `packages/platform`;
 * the UI receives one through React context and never imports a platform directly.
 * Knows nothing about PDFs. Share is added in Phase 5.
 */
export interface FileAdapter {
  /** Shows the platform's file picker. Resolves `null` when the user cancels. */
  open(): Promise<OpenedFile | null>;
  /** Reads the first PDF from a drag-and-drop payload. Resolves `null` when there is none. */
  openDropped(transfer: DataTransfer): Promise<OpenedFile | null>;
  /** Recent files, newest first. */
  listRecent(): Promise<RecentFile[]>;
  /** Reopens a recent file. Resolves `null` if it is gone or the user denies access. */
  openRecent(id: string): Promise<OpenedFile | null>;
  /** Records a successfully opened file in the recent list. */
  rememberOpened(file: OpenedFile, pageCount: number): Promise<void>;
  clearRecent(): Promise<void>;
  /**
   * Gets permission to overwrite an opened file. Call it right after the user's click: browsers only
   * ask for permission during a user action.
   * @returns A target to write to, or `null` when this file cannot be saved in place (use `pickSaveTarget`).
   */
  saveTarget(fileId: string): Promise<SaveTarget | null>;
  /**
   * Asks the user where to save a new file. Call it right after the user's click.
   * @returns A target to write to, or `null` when the user cancels.
   */
  pickSaveTarget(suggestedName: string): Promise<SaveTarget | null>;
}

/** A place to write a file, obtained before the bytes are built. */
export interface SaveTarget {
  readonly name: string;
  write(bytes: ArrayBuffer): Promise<SavedFile>;
}
