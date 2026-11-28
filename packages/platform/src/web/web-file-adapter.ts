/**
 * FileAdapter for browsers (architecture §10). Uses the File System Access API where it exists
 * (Chromium) so files can be reopened and saved in place; elsewhere a file input to open and a
 * download to save.
 */
import type { FileAdapter, OpenedFile, RecentFile, SaveTarget } from "@pdf-editor/shared";
import "./file-system-access";
import { clearRecentRecords, readRecent, readRecentById, writeRecent } from "./recent-store";

const PDF_TYPES = [{ description: "PDF documents", accept: { "application/pdf": [".pdf"] } }];

/**
 * Whether a dropped or picked file is worth reading as a PDF. The core still checks the header.
 * @param file A file from a picker or a drop.
 * @returns True for PDF types and `.pdf` names.
 */
function looksLikePdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * True for the error a picker throws when the user closes it.
 * @param error Anything thrown.
 * @returns Whether it means "cancelled".
 */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Shows a classic file input and waits for a choice.
 * @returns The chosen file, or `null` if the user cancelled.
 */
function pickWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

/**
 * Makes sure the page may use a handle, asking the user if needed. Must run during a user action.
 * @param handle A file handle.
 * @param mode Read, or read and write.
 * @returns True when allowed.
 */
async function ensurePermission(handle: FileSystemFileHandle, mode: "read" | "readwrite"): Promise<boolean> {
  if ((await handle.queryPermission?.({ mode })) === "granted") return true;
  return (await handle.requestPermission?.({ mode })) === "granted";
}

/**
 * Writes bytes to a handle, replacing the file.
 * @param handle A writable file handle.
 * @param bytes The new content.
 */
async function writeHandle(handle: FileSystemFileHandle, bytes: ArrayBuffer): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
  } finally {
    await writable.close();
  }
}

/**
 * Saves bytes through the browser's download, for browsers without the save picker.
 * @param name File name for the download.
 * @param bytes The file.
 */
function download(name: string, bytes: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Whether the browser can pick files as handles that can be written to and kept (Chromium only).
 * @returns True when both File System Access pickers exist.
 */
function supportsFileHandles(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

/**
 * Creates the browser file adapter.
 * @returns A FileAdapter backed by the File System Access API or a file input, with recent files in IndexedDB.
 */
export function createWebFileAdapter(): FileAdapter {
  /** File handles seen this session, by file id: for the recent list and for saving in place. */
  const handles = new Map<string, FileSystemFileHandle>();

  const readFile = async (
    file: File,
    handle?: FileSystemFileHandle,
    fileId: string = crypto.randomUUID(),
  ): Promise<OpenedFile> => {
    if (handle) handles.set(fileId, handle);
    return { name: file.name, bytes: await file.arrayBuffer(), fileId };
  };

  /** A target that writes to a handle and remembers it, so later saves go to the same file. */
  const handleTarget = (handle: FileSystemFileHandle, fileId: string): SaveTarget => ({
    name: handle.name,
    async write(bytes) {
      await writeHandle(handle, bytes);
      handles.set(fileId, handle);
      return { name: handle.name, fileId };
    },
  });

  return {
    canSaveInPlace: supportsFileHandles(),

    async open() {
      if (window.showOpenFilePicker) {
        try {
          const [handle] = await window.showOpenFilePicker({ types: PDF_TYPES, excludeAcceptAllOption: false });
          return handle ? readFile(await handle.getFile(), handle) : null;
        } catch (error) {
          if (isAbort(error)) return null;
          throw error;
        }
      }
      const file = await pickWithInput();
      return file ? readFile(file) : null;
    },

    async openDropped(transfer) {
      const items = [...transfer.items].filter((item) => item.kind === "file");
      for (const item of items) {
        // Ask for the handle first: it must be requested while the drop event is still active.
        const handlePromise = item.getAsFileSystemHandle?.() ?? Promise.resolve(null);
        const file = item.getAsFile();
        if (!file || !looksLikePdf(file)) continue;
        const handle = await handlePromise.catch(() => null);
        return readFile(file, handle?.kind === "file" ? (handle as FileSystemFileHandle) : undefined);
      }
      const file = [...transfer.files].find(looksLikePdf);
      return file ? readFile(file) : null;
    },

    async listRecent(): Promise<RecentFile[]> {
      const records = await readRecent();
      return records.map(({ id, name, openedAt, pageCount, handle }) => ({
        id,
        name,
        openedAt,
        pageCount,
        canReopen: Boolean(handle),
      }));
    },

    async openRecent(id) {
      const record = await readRecentById(id);
      if (!record?.handle || !(await ensurePermission(record.handle, "read"))) return null;
      try {
        return await readFile(await record.handle.getFile(), record.handle, id);
      } catch {
        return null; // moved or deleted since
      }
    },

    async rememberOpened(file, pageCount) {
      const id = file.fileId ?? crypto.randomUUID();
      await writeRecent({ id, name: file.name, openedAt: Date.now(), pageCount, handle: handles.get(id) });
    },

    clearRecent: clearRecentRecords,

    async saveTarget(fileId) {
      const handle = handles.get(fileId);
      if (!handle || !("createWritable" in handle)) return null;
      try {
        return (await ensurePermission(handle, "readwrite")) ? handleTarget(handle, fileId) : null;
      } catch {
        return null;
      }
    },

    async pickSaveTarget(suggestedName) {
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName, types: PDF_TYPES });
          return handleTarget(handle, crypto.randomUUID());
        } catch (error) {
          if (isAbort(error)) return null;
          throw error;
        }
      }
      return {
        name: suggestedName,
        async write(bytes) {
          download(suggestedName, bytes);
          return { name: suggestedName }; // no file id: a download cannot be written to again
        },
      };
    },
  };
}
