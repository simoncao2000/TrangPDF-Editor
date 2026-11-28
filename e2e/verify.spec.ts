import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test, type Page } from "playwright/test";
import {
  bounds,
  corpus,
  dblclickCenter,
  download,
  editWord,
  inspectPdf,
  openPalette,
  openPdf,
  paintTime,
  palette,
  pinch,
  rendered,
  sign,
  stroke,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Exercise the supported download fallback even on browsers with native file pickers.
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined });
  });
  await page.goto("/");
  await expect(page).toHaveTitle("TrangPDF");
});

/** @param page Browser tab. @returns First page editable text in reading order. */
async function layer(page: Page) {
  const objects = page.locator('[data-page][aria-label="Page 1"] [aria-label^="Edit text: "]');
  await expect(objects.first()).toBeVisible();
  return objects.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")!.slice(11)).join(" "));
}

/** @param text Extracted PDF text. @returns Whitespace-normalized text. */
function compact(text: string) {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

test("text round trip", async ({ page }, info) => {
  for (const name of ["latex-spaces", "fonts-truetype-subset", "fonts-cid-unicode", "fonts-standard14"]) {
    await test.step(name, async () => {
      await page.goto("/");
      const source = corpus(name + ".pdf");
      await openPdf(page, source);
      await palette(page, ">Edit text");
      const original = compact(await layer(page));
      const extracted = compact(inspectPdf(source).text);
      const word = name === "fonts-cid-unicode" ? "Biển" : "Lighthouse";
      const edit = await editWord(page, word);
      const first = edit.before.match(/\p{L}[\p{L}\p{M}]*/u)![0];
      expect(original).toContain(first);
      expect(extracted).toContain(first);
      const path = info.outputPath(name + "-saved.pdf");
      await download(page, path);
      await page.goto("/");
      await openPdf(page, path);
      await palette(page, ">Edit text");
      expect(compact(await layer(page))).toBe(original.replace(first, word));
      expect(compact(inspectPdf(path).text)).toBe(extracted.replace(first, word));
    });
  }
});

/** @param page Browser tab. @param name Fixture with pages to append. @returns Once insertion completes. */
async function append(page: Page, name: string) {
  const chooser = page.waitForEvent("filechooser");
  await palette(page, ">Import pages from a file");
  await (await chooser).setFiles(corpus(name));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Insert \d/ })
    .click();
}

/** @param page Browser tab. @returns Screen bounds of the selected tide line after highlighting it. */
async function highlightTide(page: Page) {
  await palette(page, ">Edit text");
  const text = page.getByRole("button", { name: /Edit text: Tide/ }).first();
  await text.scrollIntoViewIfNeeded();
  const label = await text.locator("xpath=ancestor::*[@data-page]").getAttribute("aria-label");
  const canvas = page.getByRole("group", { name: label!, exact: true }).locator("[data-page-canvas]");
  const original = await bounds(canvas);
  const line = await bounds(text);
  await palette(page, ">Select");
  const current = await bounds(canvas);
  const scale = current.width / original.width;
  const x = current.x + (line.x - original.x) * scale;
  const y = current.y + (line.y - original.y + line.height / 2) * scale;
  await page.mouse.move(x + line.width * scale * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(x + line.width * scale * 0.85, y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Highlight" }).click();
  await expect(page.locator('[data-page] [data-annotation][aria-label="Highlight"]')).toHaveCount(1);
  return { x, y: y - (line.height * scale) / 2, width: line.width * scale, height: line.height * scale };
}

test("flatten export in Quick Look and the app", async ({ page }, info) => {
  await openPdf(page, corpus("form-all-fields.pdf"));
  await page.getByLabel("full_name", { exact: true }).fill("Ada Harbour");
  await page.getByLabel("contact", { exact: true }).check();
  await sign(page, false);
  await palette(page, ">Select");
  await expect(page.locator('[data-annotation][aria-label="Image"]')).toHaveCount(1);
  // Form pages contain only widgets. Append a selectable corpus line for the markup operation.
  await append(page, "text.pdf");
  await palette(page, ":2");
  await rendered(page, 2);
  await highlightTide(page);
  await palette(page, ">Export a copy");
  await page.getByLabel("Flatten annotations").check();
  const path = info.outputPath("flat.pdf");
  await download(page, path, () => page.getByRole("button", { name: "Export", exact: true }).click());
  const pdf = inspectPdf(path);
  expect(pdf.annotations).toEqual([]);
  expect(pdf.fields).toEqual([]);
  execFileSync("qlmanage", ["-t", "-s", "800", "-o", dirname(path), path], { timeout: 30_000 });
  await page.goto("/");
  await openPdf(page, path);
  const png = (await readFile(path + ".png")).toString("base64");
  const samples = await (
    await rendered(page)
  ).evaluate(async (app: HTMLCanvasElement, data) => {
    const image = new Image();
    image.src = "data:image/png;base64," + data;
    await image.decode();
    const quick = document.createElement("canvas");
    quick.width = image.width;
    quick.height = image.height;
    quick.getContext("2d")!.drawImage(image, 0, 0);
    return [quick, app].map((canvas) => {
      const scale = Math.min(canvas.width / 612, canvas.height / 792);
      const left = (canvas.width - 612 * scale) / 2;
      const top = (canvas.height - 792 * scale) / 2;
      return [
        [75, 82, 140, 17],
        [300, 712, 170, 44],
        [77, 161, 6, 6],
      ].map(([x, y, w, h]) => {
        const pixels = canvas
          .getContext("2d")!
          .getImageData(left + x! * scale, top + y! * scale, Math.max(1, w! * scale), Math.max(1, h! * scale)).data;
        let ink = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3]! > 200 && pixels[i]! < 200) ink++;
        }
        return ink;
      });
    });
  }, png);
  for (const areas of samples) for (const ink of areas) expect(ink).toBeGreaterThan(2);
});

test("1000 pages, scroll and zoom", async ({ page }, info) => {
  const firstMs = await openPdf(page, corpus("large-1000-pages.pdf"));
  await (await openPalette(page)).fill(":500");
  const jump = page.getByRole("option", { name: /Go to page 500/ });
  await expect(jump).toBeVisible();
  const start = await page.evaluate(() => performance.now());
  await jump.click();
  const jumpMs = (await paintTime(page, 500)) - start;
  const viewport = page.getByLabel("Document pages");
  await viewport.hover();
  const monitor = await page.evaluateHandle(() => {
    const measures = { maxFrameMs: 0, maxTaskMs: 0, frame: 0 };
    let last = performance.now();
    const frame = (now: number) => {
      measures.maxFrameMs = Math.max(measures.maxFrameMs, now - last);
      last = now;
      measures.frame = requestAnimationFrame(frame);
    };
    measures.frame = requestAnimationFrame(frame);
    const observer = new PerformanceObserver((list) => {
      for (const task of list.getEntries()) measures.maxTaskMs = Math.max(measures.maxTaskMs, task.duration);
    });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) observer.observe({ type: "longtask" });
    return { measures, observer, start: last };
  });
  // Mobile WebKit has no Playwright wheel or native swipe API. Model inertial scrolling over animation frames.
  if (info.project.name === "webkit-iphone") {
    await viewport.evaluate(async (el) => {
      const start = el.scrollTop;
      const distance = el.scrollHeight - el.clientHeight - start;
      const begin = performance.now();
      let progress = 0;
      while (progress < 1) {
        const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
        progress = Math.min(1, (now - begin) / 900);
        el.scrollTop = start + distance * (1 - (1 - progress) ** 3);
      }
    });
  } else {
    const delta = await viewport.evaluate((el) => Math.ceil((el.scrollHeight - el.scrollTop) / 12));
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, delta);
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
  }
  await rendered(page, 1000);
  const timing = await monitor.evaluate(async ({ measures, observer, start }) => {
    await new Promise(requestAnimationFrame);
    cancelAnimationFrame(measures.frame);
    for (const task of observer.takeRecords()) measures.maxTaskMs = Math.max(measures.maxTaskMs, task.duration);
    observer.disconnect();
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return {
      scrollMs: performance.now() - start,
      maxFrameMs: measures.maxFrameMs,
      maxTaskMs: measures.maxTaskMs,
      heapBytes: perf.memory?.usedJSHeapSize ?? null,
    };
  });
  const result = { firstMs, jumpMs, ...timing };
  const path = "e2e/results/perf.json";
  await mkdir(dirname(path), { recursive: true });
  const prior = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return "{}";
  });
  await writeFile(path, JSON.stringify({ ...JSON.parse(prior), [info.project.name]: result }, null, 2));
  const paper = page.locator('[data-page][aria-label="Page 1000"]');
  const width = (await bounds(paper)).width;
  if (info.project.name === "webkit-iphone") await palette(page, ">Zoom in");
  else await pinch(page, false);
  await expect.poll(async () => (await bounds(paper)).width).toBeGreaterThan(width);
  if (info.project.name === "webkit-iphone") await palette(page, ">Fit width");
  else await pinch(page, false, true);
  await expect.poll(async () => Math.abs((await bounds(paper)).width - width)).toBeLessThan(3);
  expect.soft(firstMs).toBeLessThanOrEqual(3000);
  expect.soft(jumpMs).toBeLessThanOrEqual(2000);
  expect.soft(Math.max(timing.maxFrameMs, timing.maxTaskMs)).toBeLessThanOrEqual(500);
});

test("phone gestures, tool card, page menu and tap-to-sign", async ({ page }, info) => {
  await openPdf(page, corpus("three-pages.pdf"));
  const paper = await rendered(page);
  const toolbar = page.getByRole("toolbar", { name: "Tools" });
  const header = page.locator("header").filter({ visible: true }).first();
  const heights = [(await bounds(header)).height, (await bounds(toolbar)).height];
  const width = (await bounds(paper)).width;
  await pinch(page, info.project.name === "webkit-iphone");
  await expect.poll(async () => (await bounds(paper)).width).toBeGreaterThan(width);
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  expect([(await bounds(header)).height, (await bounds(toolbar)).height]).toEqual(heights);
  await palette(page, ">Fit page");
  await palette(page, ">Draw");
  await page.getByLabel("Collapse options").tap();
  await page.getByRole("button", { name: /^Expand/ }).tap();
  await expect(page.getByLabel("Collapse options")).toBeVisible();
  await palette(page, ">Organize pages");
  const tile = page.locator("[data-page-tile]").first();
  const touch = await tile.evaluateHandle((target) => {
    const box = target.getBoundingClientRect();
    const point = { identifier: 1, target, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    const legacy = document as Document & { createTouch?: (...args: unknown[]) => Touch };
    return legacy.createTouch
      ? legacy.createTouch(window, target, 1, point.clientX, point.clientY, point.clientX, point.clientY)
      : new Touch(point);
  });
  await tile.dispatchEvent("touchstart", { touches: [touch], targetTouches: [touch], changedTouches: [touch] });
  await expect(page.getByLabel("Actions for page 1")).toBeVisible();
  await tile.dispatchEvent("touchend", { touches: [], targetTouches: [], changedTouches: [touch] });
  await page.keyboard.press("Escape");
  await palette(page, ">Back to reading");
  await sign(page, true);
  await palette(page, ">Select");
  await expect(page.locator('[data-annotation][aria-label="Image"]')).toHaveCount(1);
});

interface PageState {
  size: number[];
  rotation: number;
  text: string;
  annotations: string[][];
  colours: string[];
}

/** @param path Saved PDF. @returns Semantic state of each page in document order. */
function historyState(path: string): PageState[] {
  const script = `
import json,sys
from pypdf import PdfReader
def state(p):
    stack, colour, colours = [], ['0'], []
    def operation(op, args, cm, tm):
        nonlocal colour
        if op == b'q': stack.append(colour)
        if op == b'Q' and stack: colour=stack.pop()
        if op in (b'rg',b'g',b'k',b'sc',b'scn') and all(not hasattr(x,'startswith') or x.replace('.','',1).lstrip('-').isdigit() for x in map(str,args)): colour=[str(float(x)) for x in args]
        if op in (b'TJ',b'Tj'): colours.append(','.join(colour))
    text=p.extract_text(visitor_operand_before=operation)
    annots=[ref.get_object() for ref in p.get('/Annots',[])]
    return dict(text=' '.join(text.split()),size=list(map(float,p.mediabox)),rotation=p.rotation,
        colours=sorted(set(c for c in colours if any(float(x) for x in c.split(',')))),
        annotations=sorted([[str(a.get(k,'')) for k in ('/Subtype','/Contents','/RC')] for a in annots]))
print(json.dumps([state(p) for p in PdfReader(sys.argv[1]).pages]))
`;
  return JSON.parse(execFileSync("python3", ["-c", script, path], { encoding: "utf8" }));
}

test("mixed undo, redo and saved state", async ({ page }, info) => {
  await openPdf(page, corpus("text.pdf"));
  await append(page, "three-pages.pdf");
  await palette(page, ":1");
  await rendered(page);
  let serial = 0;
  /** @returns Semantic snapshot from a fresh download. */
  async function snapshot() {
    const path = info.outputPath(`history-${serial++}.pdf`);
    await download(page, path);
    return historyState(path);
  }
  const states = [await snapshot()];
  expect(states[0]).toHaveLength(4);
  const line = await highlightTide(page);
  states.push(await snapshot());
  expect(states.at(-1)![0]!.annotations.flat()).toContain("/Highlight");
  await palette(page, ">Note");
  await page.mouse.click(line.x + 30, line.y + 100);
  states.push(await snapshot());
  expect(states.at(-1)![0]!.annotations.flat()).toContain("/Text");
  const author = page.getByRole("textbox", { name: "Your name" });
  const comment = page.getByRole("textbox", { name: "Add a comment" });
  await comment.click();
  await comment.press("ControlOrMeta+b");
  await page.keyboard.insertText("Reviewed");
  await page.getByLabel("Send", { exact: true }).click();
  await author.fill("Reviewer");
  await author.press("Enter");
  states.push(await snapshot());
  expect(states.at(-1)![0]!.annotations.flat()).toContain("/Text");
  expect(states.at(-1)![0]!.annotations.flat().join(" ")).toContain("<b>Reviewed</b>");
  const edit = await editWord(page, "Harbour");
  states.push(await snapshot());
  expect(states.at(-1)![0]!.text).toContain(compact(edit.after));
  await palette(page, ">Organize pages");
  await page.getByRole("option", { name: "Page 2", exact: true }).click({ button: "right" });
  await page.getByRole("button", { name: "Move to…" }).click();
  await page.getByLabel("Later").click();
  await page.getByLabel("Later").click();
  await page.getByRole("button", { name: "Move page 2" }).click();
  await palette(page, ">Back to reading");
  await palette(page, ":1");
  states.push(await snapshot());
  const previous = states.at(-2)!;
  expect(states.at(-1)).toEqual([previous[0], previous[2], previous[1], previous[3]]);
  await stroke(page, "Draw", { ...line, y: line.y + 130 });
  states.push(await snapshot());
  expect(states.at(-1)![0]!.annotations.flat()).toContain("/Ink");
  await palette(page, ">Edit text");
  await dblclickCenter(page, page.getByRole("button", { name: /^Edit text: Harbour/ }).first());
  const editor = page.getByLabel("Page text", { exact: true });
  await editor.press("ControlOrMeta+a");
  await page
    .getByRole("button", { name: /^Text colour/ })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Blue", exact: true }).filter({ visible: true }).last().click();
  await page.keyboard.press("Escape");
  await editor.press("Enter");
  await expect(editor).toBeHidden();
  // The colour edit is written by the worker after the editor closes; save once it has landed.
  const before = states.at(-1)![0]!.colours;
  let coloured = states.at(-1)!;
  await expect
    .poll(async () => {
      coloured = await snapshot();
      return coloured[0]!.colours;
    })
    .not.toEqual(before);
  states.push(coloured);
  for (const state of states.slice(0, -1).reverse()) {
    await palette(page, ">Undo");
    expect(await snapshot()).toEqual(state);
  }
  for (const state of states.slice(1)) {
    await palette(page, ">Redo");
    expect(await snapshot()).toEqual(state);
  }
  const path = info.outputPath("mixed-final.pdf");
  await download(page, path);
  await page.goto("/");
  await openPdf(page, path);
  await palette(page, ">Edit text");
  expect(compact(await layer(page))).toContain(compact(edit.after));
  expect(await snapshot()).toEqual(states.at(-1));
});
