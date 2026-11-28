import { describe, expect, it } from "bun:test";
import { RenderCancelledError, RenderQueue, type CancellableWork } from "./render-queue";

/**
 * Work that finishes only when the test says so.
 * @param log Where to record start, cancel and finish events.
 * @param name Label used in the log.
 * @returns The work plus a `finish` trigger.
 */
function controllable(log: string[], name: string): CancellableWork<string> & { finish(): void } {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  log.push(`start ${name}`);
  return { promise, cancel: () => log.push(`cancel ${name}`), finish: () => resolve(name) };
}

describe("RenderQueue", () => {
  it("runs the lowest priority number first, within the concurrency limit", async () => {
    const queue = new RenderQueue(1);
    const log: string[] = [];
    const running: Record<string, ReturnType<typeof controllable>> = {};
    const add = (name: string, priority: number) =>
      queue.enqueue(() => (running[name] = controllable(log, name)), priority);

    const first = add("first", 5);
    add("far", 9);
    add("near", 1);
    expect(log).toEqual(["start first"]);

    running.first!.finish();
    await first.promise;
    await Promise.resolve();
    expect(log).toEqual(["start first", "start near"]);
  });

  it("drops a job cancelled before it starts", async () => {
    const queue = new RenderQueue(1);
    const log: string[] = [];
    queue.enqueue(() => controllable(log, "busy"), 0);
    const waiting = queue.enqueue(() => controllable(log, "never"), 1);
    waiting.cancel();
    await expect(waiting.promise).rejects.toBeInstanceOf(RenderCancelledError);
    expect(queue.pendingCount).toBe(0);
    expect(log).toEqual(["start busy"]);
  });

  it("forwards cancel to a running job", () => {
    const queue = new RenderQueue(1);
    const log: string[] = [];
    const job = queue.enqueue(() => controllable(log, "running"), 0);
    job.cancel();
    expect(log).toEqual(["start running", "cancel running"]);
  });

  it("reorders by updated priority", async () => {
    const queue = new RenderQueue(1);
    const log: string[] = [];
    let busy!: ReturnType<typeof controllable>;
    const busyJob = queue.enqueue(() => (busy = controllable(log, "busy")), 0);
    queue.enqueue(() => controllable(log, "a"), 1);
    const b = queue.enqueue(() => controllable(log, "b"), 2);
    b.setPriority(0);
    busy.finish();
    await busyJob.promise;
    await Promise.resolve();
    expect(log).toEqual(["start busy", "start b"]);
  });
});
