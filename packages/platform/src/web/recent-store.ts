/**
 * Recent files for the web, in IndexedDB. File handles (Chromium) are stored with the entry so the
 * file can be reopened later; other browsers keep only the name.
 */

export interface RecentRecord {
  readonly id: string;
  readonly name: string;
  readonly openedAt: number;
  readonly pageCount: number;
  readonly handle?: FileSystemFileHandle;
}

const DB_NAME = "trangpdf";
const DB_VERSION = 1;
const STORE = "recent-files";
/** Oldest entries beyond this are dropped. */
export const RECENT_LIMIT = 12;

/**
 * Wraps an IndexedDB request in a promise.
 * @param request Any IDB request.
 * @returns Its result.
 */
function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Opens (and on first use creates) the database.
 * @returns The database connection.
 */
function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
  return settle(request);
}

/**
 * Runs one operation in a transaction on the recent-files store.
 * @param mode Read-only or read-write.
 * @param operation Receives the object store and returns a request.
 * @returns The request's result.
 */
async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await settle(operation(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

/**
 * Every recent file, newest first.
 * @returns The stored records.
 */
export async function readRecent(): Promise<RecentRecord[]> {
  const all = await withStore("readonly", (store) => store.getAll() as IDBRequest<RecentRecord[]>);
  return all.sort((a, b) => b.openedAt - a.openedAt);
}

/**
 * Saves a record, replacing any older entry with the same name, and trims the list.
 * @param record The file that was just opened.
 */
export async function writeRecent(record: RecentRecord): Promise<void> {
  const existing = await readRecent();
  const stale = existing.filter((entry) => entry.id !== record.id && entry.name === record.name);
  const overflow = existing.filter((entry) => !stale.includes(entry) && entry.id !== record.id).slice(RECENT_LIMIT - 1);
  for (const entry of [...stale, ...overflow]) await withStore("readwrite", (store) => store.delete(entry.id));
  await withStore("readwrite", (store) => store.put(record));
}

/**
 * Finds one record.
 * @param id Record id.
 * @returns The record or `undefined`.
 */
export async function readRecentById(id: string): Promise<RecentRecord | undefined> {
  return withStore("readonly", (store) => store.get(id) as IDBRequest<RecentRecord | undefined>);
}

/** Deletes every record. */
export async function clearRecentRecords(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
}
