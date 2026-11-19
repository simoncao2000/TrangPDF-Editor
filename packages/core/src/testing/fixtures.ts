/** Test helpers: corpus files and an in-memory engine wired exactly like the real worker. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { EngineClient, type EngineTransport } from "../engine/engine-client";
import { createEngineHost } from "../engine/engine-host";
import { PdfiumEngine } from "../engine/pdfium-engine";
import type { EngineRequest, EngineResponse } from "../engine/protocol";

const corpus = new URL("../../../../test-corpus/", import.meta.url);

/**
 * Reads a corpus file into a fresh ArrayBuffer.
 * @param name File name inside `test-corpus/`.
 * @returns Its bytes.
 */
export function corpusFile(name: string): ArrayBuffer {
  const data = readFileSync(fileURLToPath(new URL(name, corpus)));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

/**
 * Loads the pdfium.wasm that matches the installed package.
 * @returns The wasm bytes.
 */
export function pdfiumWasm(): ArrayBuffer {
  const path = createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm");
  const data = readFileSync(path);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

/** Stand-in for ImageBitmap in Node: keeps the pixels so tests can inspect them. */
export interface FakeBitmap {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  closed: boolean;
  close(): void;
}

/**
 * An EngineClient talking to a real engine host and PDFium, through an in-memory transport.
 * @returns The client, ready after `init`.
 */
export async function createTestEngine(): Promise<EngineClient> {
  const listeners: ((event: MessageEvent<EngineResponse>) => void)[] = [];
  const host = createEngineHost({
    loadWasm: async () => pdfiumWasm(),
    createEngine: (wasm) => PdfiumEngine.create(wasm),
    toBitmap: async ({ width, height, pixels }) =>
      ({ width, height, pixels, closed: false, close() { this.closed = true; } }) satisfies FakeBitmap as unknown as ImageBitmap,
    post: (response) => queueMicrotask(() => listeners.forEach((listener) => listener({ data: response } as MessageEvent<EngineResponse>))),
  });
  const transport: EngineTransport = {
    postMessage: (message: EngineRequest) => host.receive(structuredClone(message)),
    addEventListener: ((type: string, listener: (event: MessageEvent<EngineResponse>) => void) => {
      if (type === "message") listeners.push(listener);
    }) as EngineTransport["addEventListener"],
    terminate: () => {},
  };
  const client = new EngineClient(transport);
  await client.call("init", { wasmUrl: "pdfium.wasm" }).promise;
  return client;
}
