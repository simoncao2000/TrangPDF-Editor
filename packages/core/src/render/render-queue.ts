/**
 * Runs render jobs nearest-page-first with a small concurrency limit (architecture §8.1).
 * Jobs that are cancelled before they start never reach the worker.
 */

/** A started unit of work that can be cancelled while it runs. */
export interface CancellableWork<T> {
  readonly promise: Promise<T>;
  cancel(): void;
}

/** A queued or running job. Lower priority numbers run first. */
export interface QueuedJob<T> extends CancellableWork<T> {
  setPriority(priority: number): void;
}

/** Rejection reason for jobs cancelled by the caller. */
export class RenderCancelledError extends Error {
  constructor() {
    super("Render cancelled.");
    this.name = "RenderCancelledError";
  }
}

interface Entry {
  priority: number;
  readonly order: number;
  start(): void;
  cancelled: boolean;
}

export class RenderQueue {
  private readonly waiting: Entry[] = [];
  private running = 0;
  private enqueued = 0;
  private readonly concurrency: number;

  /**
   * @param concurrency Jobs allowed in flight at once. Two keeps the worker busy without
   *   queueing work there that the main thread can no longer reorder.
   */
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
  }

  /** Jobs waiting to start. */
  get pendingCount(): number {
    return this.waiting.length;
  }

  /**
   * Adds a job.
   * @param begin Starts the work; called once, when the job's turn comes.
   * @param priority Lower runs sooner (use distance from the current page).
   * @returns A handle to await, cancel or reprioritise the job.
   */
  enqueue<T>(begin: () => CancellableWork<T>, priority: number): QueuedJob<T> {
    let work: CancellableWork<T> | null = null;
    let resolveJob!: (value: T) => void;
    let rejectJob!: (reason: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      resolveJob = resolve;
      rejectJob = reject;
    });

    const entry: Entry = {
      priority,
      order: this.enqueued++,
      cancelled: false,
      start: () => {
        this.running++;
        work = begin();
        work.promise.then(resolveJob, rejectJob).finally(() => {
          this.running--;
          this.pump();
        });
      },
    };
    this.waiting.push(entry);
    this.pump();

    return {
      promise,
      cancel: () => {
        if (entry.cancelled) return;
        entry.cancelled = true;
        if (work) {
          work.cancel();
        } else {
          this.waiting.splice(this.waiting.indexOf(entry), 1);
          rejectJob(new RenderCancelledError());
        }
      },
      setPriority: (next) => {
        entry.priority = next;
      },
    };
  }

  /** Starts waiting jobs, best priority first, while there is capacity. */
  private pump(): void {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      let bestIndex = 0;
      for (let i = 1; i < this.waiting.length; i++) {
        const candidate = this.waiting[i]!;
        const best = this.waiting[bestIndex]!;
        if (candidate.priority < best.priority || (candidate.priority === best.priority && candidate.order < best.order)) bestIndex = i;
      }
      const [next] = this.waiting.splice(bestIndex, 1);
      next!.start();
    }
  }
}
