/** A user-added font stored locally as validated sfnt bytes. */
export interface FontFileRecord {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly style: string;
  readonly bytes: ArrayBuffer;
}

/** Platform storage for fonts the user explicitly adds. */
export interface FontFileStore {
  /** @returns The saved fonts. */
  list(): Promise<FontFileRecord[]>;
  /** @param record The font to save. @returns Completion of the write. */
  add(record: FontFileRecord): Promise<void>;
  /** @param id The font to delete. @returns Completion of the deletion. */
  remove(id: string): Promise<void>;
}
