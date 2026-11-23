import type { FontFileRecord, FontFileStore } from "@pdf-editor/shared";

const DB_NAME = "trangpdf-fonts";
const DB_VERSION = 1;
const STORE = "font-files";

/**
 * Opens the isolated database for explicitly added fonts.
 * @returns The open database.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Waits for the transaction to finish before reporting success.
 * @param mode The transaction mode.
 * @param operation The store operation.
 * @returns The committed request result.
 */
async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? request.error);
    });
  } finally {
    db.close();
  }
}

/** @returns The web implementation of the local font-file store. */
export function createWebFontFileStore(): FontFileStore {
  return {
    /** @returns All saved local font records. */
    list: () => withStore("readonly", (store) => store.getAll() as IDBRequest<FontFileRecord[]>),
    /** @param record The validated record. @returns Completion of the transaction. */
    async add(record) {
      await withStore("readwrite", (store) => store.add(record));
    },
    /** @param id The stored font id. @returns Completion of the transaction. */
    async remove(id) {
      await withStore("readwrite", (store) => store.delete(id));
    },
  };
}
