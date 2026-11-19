/// <reference lib="webworker" />
/**
 * Worker entry point. Started by `spawnEngineWorker()`; everything else lives in `engine-host.ts`.
 */
import { createEngineHost } from "./engine-host";
import { PdfiumEngine } from "./pdfium-engine";
import type { EngineRequest } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

const host = createEngineHost({
  async loadWasm(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
    return response.arrayBuffer();
  },
  createEngine: (wasm) => PdfiumEngine.create(wasm),
  toBitmap: ({ width, height, pixels }) => createImageBitmap(new ImageData(pixels, width, height)),
  post: (response, transfer = []) => scope.postMessage(response, transfer),
});

scope.addEventListener("message", (event: MessageEvent<EngineRequest>) => host.receive(event.data));
