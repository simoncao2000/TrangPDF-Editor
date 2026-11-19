/**
 * Least-recently-used cache of rendered pages with a memory budget (architecture §8.1, §8.2).
 * Evicted bitmaps are closed so their memory is freed right away.
 */

/** Anything with pixel dimensions that can release its memory; `ImageBitmap` fits. */
export interface ClosableBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

/** Bitmap budgets from the performance targets. */
export const DESKTOP_CACHE_BYTES = 256 * 1024 * 1024;
export const MOBILE_CACHE_BYTES = 96 * 1024 * 1024;
const BYTES_PER_PIXEL = 4;

/**
 * Memory a bitmap uses.
 * @param bitmap A rendered page.
 * @returns Its size in bytes (4 per pixel).
 */
export function bitmapBytes(bitmap: ClosableBitmap): number {
  return bitmap.width * bitmap.height * BYTES_PER_PIXEL;
}

export class BitmapCache<B extends ClosableBitmap = ClosableBitmap> {
  /** Map iteration order is insertion order, so the first key is the least recently used. */
  private readonly entries = new Map<string, B>();
  private used = 0;
  private readonly budgetBytes: number;

  /**
   * @param budgetBytes Most memory the cache may hold before evicting.
   */
  constructor(budgetBytes: number) {
    this.budgetBytes = budgetBytes;
  }

  /** Bytes currently held. */
  get usedBytes(): number {
    return this.used;
  }

  /**
   * Looks up a bitmap and marks it as recently used.
   * @param key Cache key.
   * @returns The bitmap, or `undefined`.
   */
  get(key: string): B | undefined {
    const bitmap = this.entries.get(key);
    if (!bitmap) return undefined;
    this.entries.delete(key);
    this.entries.set(key, bitmap);
    return bitmap;
  }

  /**
   * Stores a bitmap, then evicts the oldest entries until the cache fits its budget.
   * The newest entry is never evicted, even if it alone exceeds the budget.
   * @param key Cache key.
   * @param bitmap The bitmap; the cache now owns it and closes it on eviction.
   */
  set(key: string, bitmap: B): void {
    this.delete(key);
    this.entries.set(key, bitmap);
    this.used += bitmapBytes(bitmap);
    for (const [oldKey] of this.entries) {
      if (this.used <= this.budgetBytes || oldKey === key) break;
      this.delete(oldKey);
    }
  }

  /**
   * Removes and closes one entry.
   * @param key Cache key.
   */
  delete(key: string): void {
    const bitmap = this.entries.get(key);
    if (!bitmap) return;
    this.entries.delete(key);
    this.used -= bitmapBytes(bitmap);
    bitmap.close();
  }

  /**
   * Removes every entry whose key starts with `prefix` (e.g. all pages of a closed document).
   * @param prefix Key prefix.
   */
  deleteByPrefix(prefix: string): void {
    for (const key of [...this.entries.keys()]) if (key.startsWith(prefix)) this.delete(key);
  }

  /**
   * Finds the largest cached bitmap whose key starts with `prefix`, without changing recency.
   * Used to show a stretched lower-resolution copy while the sharp one renders.
   * @param prefix Key prefix for one page.
   * @returns The bitmap, or `undefined`.
   */
  largestWithPrefix(prefix: string): B | undefined {
    let best: B | undefined;
    for (const [key, bitmap] of this.entries) {
      if (key.startsWith(prefix) && (!best || bitmap.width > best.width)) best = bitmap;
    }
    return best;
  }
}
