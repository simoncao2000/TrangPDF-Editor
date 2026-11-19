/** End-to-end protocol tests: EngineClient → engine host → real PDFium, over an in-memory transport. */
import { beforeAll, describe, expect, it } from "bun:test";
import { pageSizeOf } from "../geometry/coordinates";
import { corpusFile, createTestEngine, type FakeBitmap } from "../testing/fixtures";
import { EngineCallError, type EngineClient } from "./engine-client";
import type { EngineError } from "./protocol";

/**
 * Awaits a call that should fail.
 * @param promise The call's promise.
 * @returns The engine error it rejected with.
 */
async function rejection(promise: Promise<unknown>): Promise<EngineError> {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(EngineCallError);
  return (error as EngineCallError).detail;
}

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

/**
 * Opens a corpus file and expects it to fail.
 * @param name Corpus file name.
 * @param password Optional password.
 * @returns The engine error.
 */
function openFailure(name: string, password?: string): Promise<EngineError> {
  return rejection(engine.call("open", { source: { bytes: corpusFile(name) }, password }).promise);
}

describe("engine protocol", () => {
  it("opens a file and reports every page's crop box and own rotation", async () => {
    const opened = await engine.call("open", { source: { bytes: corpusFile("three-pages.pdf") } }).promise;
    expect(opened.pageCount).toBe(3);
    expect(opened.pages).toEqual([
      { cropBox: { x: 0, y: 0, width: 612, height: 792 }, rotation: 0 },
      { cropBox: { x: 0, y: 0, width: 595, height: 842 }, rotation: 0 },
      { cropBox: { x: 0, y: 0, width: 612, height: 792 }, rotation: 90 },
    ]);
    expect(opened.pages.map((page) => pageSizeOf(page))).toEqual([
      { width: 612, height: 792 },
      { width: 595, height: 842 },
      { width: 792, height: 612 },
    ]);
    await engine.call("close", { docId: opened.docId }).promise;
  });

  it("renders a page at the requested pixel size, in RGBA", async () => {
    const { docId } = await engine.call("open", { source: { bytes: corpusFile("three-pages.pdf") } }).promise;
    const rendered = await engine.call("renderPage", { docId, pageIndex: 0, width: 100, height: 129 }).promise;
    const bitmap = rendered.bitmap as unknown as FakeBitmap;
    expect([bitmap.width, bitmap.height]).toEqual([100, 129]);
    const offset = (100 * 100 + 50) * 4; // inside the filled rectangle in the lower half
    expect(Array.from(bitmap.pixels.slice(offset, offset + 4))).toEqual([26, 77, 128, 255]);
    const corner = Array.from(bitmap.pixels.slice(0, 4));
    expect(corner).toEqual([255, 255, 255, 255]);
    await engine.call("close", { docId }).promise;
  });

  it("asks for a password, rejects a wrong one, then opens from the bytes it kept", async () => {
    const first = await openFailure("encrypted-harbour.pdf");
    expect(first.code).toBe("password-required");
    expect(first.lockedId).toBeTruthy();

    const wrong = await rejection(engine.call("open", { source: { lockedId: first.lockedId! }, password: "nope" }).promise);
    expect(wrong.code).toBe("wrong-password");

    const opened = await engine.call("open", { source: { lockedId: first.lockedId! }, password: "harbour" }).promise;
    expect(opened.pageCount).toBe(3);
  });

  it("reports a damaged file", async () => {
    expect((await openFailure("damaged.pdf")).code).toBe("damaged");
  });

  it("does not render a call that was cancelled before it ran", async () => {
    const { docId } = await engine.call("open", { source: { bytes: corpusFile("three-pages.pdf") } }).promise;
    const call = engine.call("renderPage", { docId, pageIndex: 1, width: 50, height: 70 });
    call.cancel();
    const error = await rejection(call.promise);
    expect(error.code).toBe("cancelled");
  });

  it("rejects calls for a closed document", async () => {
    const { docId } = await engine.call("open", { source: { bytes: corpusFile("three-pages.pdf") } }).promise;
    await engine.call("close", { docId }).promise;
    const error = await rejection(engine.call("renderPage", { docId, pageIndex: 0, width: 10, height: 10 }).promise);
    expect(error.code).toBe("unknown-document");
  });

  it("renders a page turned by an extra rotation", async () => {
    const { docId } = await engine.call("open", { source: { bytes: corpusFile("three-pages.pdf") } }).promise;
    const rendered = await engine.call("renderPage", { docId, pageIndex: 0, width: 129, height: 100, rotation: 90 }).promise;
    const bitmap = rendered.bitmap as unknown as FakeBitmap;
    // Page 1 has its blue band at the bottom; turned clockwise the band is on the left.
    const leftMiddle = (50 * 129 + 20) * 4;
    const rightMiddle = (50 * 129 + 110) * 4;
    expect(Array.from(bitmap.pixels.slice(leftMiddle, leftMiddle + 4))).toEqual([26, 77, 128, 255]);
    expect(Array.from(bitmap.pixels.slice(rightMiddle, rightMiddle + 4))).toEqual([255, 255, 255, 255]);
  });
});

describe("assemble (save pipeline)", () => {
  /**
   * Opens a corpus file.
   * @returns Its docId.
   */
  const openThreePages = async () => (await engine.call("open", { source: { bytes: corpusFile("three-pages.pdf") } }).promise).docId;

  /**
   * Reopens built bytes and reads their page sizes.
   * @param bytes The built file.
   * @returns Page sizes in points.
   */
  const sizesOf = async (bytes: ArrayBuffer) => {
    const reopened = await engine.call("open", { source: { bytes } }).promise;
    await engine.call("close", { docId: reopened.docId }).promise;
    return reopened.pages.map((page) => pageSizeOf(page)).map(({ width, height }) => `${width}x${height}`);
  };

  it("reorders, drops and rotates pages of one file", async () => {
    const a = await openThreePages();
    const { bytes } = await engine.call("assemble", {
      parts: [
        { docId: a, pageIndex: 2, rotation: 0 },
        { docId: a, pageIndex: 0, rotation: 90 },
      ],
    }).promise;
    expect(await sizesOf(bytes)).toEqual(["792x612", "792x612"]);
  });

  it("merges pages from two files in the requested order", async () => {
    const a = await openThreePages();
    const b = await openThreePages();
    const { bytes } = await engine.call("assemble", {
      parts: [
        { docId: a, pageIndex: 0, rotation: 0 },
        { docId: b, pageIndex: 1, rotation: 0 },
        { docId: b, pageIndex: 2, rotation: 270 },
        { docId: a, pageIndex: 1, rotation: 180 },
      ],
    }).promise;
    expect(await sizesOf(bytes)).toEqual(["612x792", "595x842", "612x792", "595x842"]);
  });

  it("keeps an encrypted file encrypted when building, and verifies it with its password", async () => {
    const first = await rejection(engine.call("open", { source: { bytes: corpusFile("encrypted-harbour.pdf") } }).promise);
    const opened = await engine.call("open", { source: { lockedId: first.lockedId! }, password: "harbour" }).promise;
    const { bytes } = await engine.call("assemble", { parts: [{ docId: opened.docId, pageIndex: 1, rotation: 0 }] }).promise;
    const locked = await rejection(engine.call("open", { source: { bytes } }).promise);
    expect(locked.code).toBe("password-required"); // still protected after saving
    const reopened = await engine.call("open", { source: { lockedId: locked.lockedId! }, password: "harbour" }).promise;
    expect(reopened.pages.map((page) => pageSizeOf(page))).toEqual([{ width: 595, height: 842 }]);
  });

  it("refuses parts from a closed document", async () => {
    const a = await openThreePages();
    await engine.call("close", { docId: a }).promise;
    const error = await rejection(engine.call("assemble", { parts: [{ docId: a, pageIndex: 0, rotation: 0 }] }).promise);
    expect(error.code).toBe("unknown-document");
  });
});
