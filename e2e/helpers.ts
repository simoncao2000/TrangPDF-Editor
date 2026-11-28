import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { expect, type Locator, type Page } from "playwright/test";

/** @param name Fixture filename. @returns Absolute corpus path. */
export function corpus(name: string) {
  return resolve("test-corpus", name);
}

/** @param page Browser tab. @param number One-based page. @returns Timestamp of the first observed painted frame. */
export async function paintTime(page: Page, number: number) {
  const timestamp = await page.waitForFunction(
    (n) => {
      const paper = document.querySelector(`[data-page][aria-label="Page ${n}"]`);
      const canvas = paper?.querySelector<HTMLCanvasElement>("canvas[data-page-canvas][width][height]");
      if (!canvas || !canvas.width || !canvas.height) return false;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = false;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3]! > 0 && (pixels[i]! < 250 || pixels[i + 1]! < 250 || pixels[i + 2]! < 250)) {
          painted = true;
          break;
        }
      }
      if (!painted) return false;
      const box = canvas.getBoundingClientRect();
      const view = canvas.closest('[aria-label="Document pages"]')!.getBoundingClientRect();
      if (box.bottom <= view.top || box.top >= view.bottom) return false;
      return performance.now();
    },
    number,
    { polling: "raf", timeout: 15_000 },
  );
  return Number(await timestamp.jsonValue());
}

/** @param page Browser tab. @param number One-based page. @returns Painted page canvas. */
export async function rendered(page: Page, number = 1) {
  await paintTime(page, number);
  const canvas = page.locator(`[data-page][aria-label="Page ${number}"] canvas[data-page-canvas]`);
  // The first paint can be a blurred placeholder; wait for the sharp bitmap at the displayed size.
  await canvas.evaluate(
    (node: HTMLCanvasElement) =>
      new Promise<void>((done) => {
        const check = () =>
          node.width >= node.clientWidth * devicePixelRatio * 0.9 ? done() : requestAnimationFrame(check);
        check();
      }),
  );
  return canvas;
}

/** @param page Browser tab. @param path PDF to open. @returns Browser milliseconds from drop to first paint check. */
export async function openPdf(page: Page, path: string) {
  await expect(page.getByRole("heading", { name: "Drop a PDF here" })).toBeVisible();
  const data = (await readFile(path)).toString("base64");
  // The window drop listener is only armed once the editor is ready, so retry the drop until a page appears.
  let start = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    start = await page.evaluate(
      ({ name, data }) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], name, { type: "application/pdf" }));
        const now = performance.now();
        for (const type of ["dragenter", "dragover", "drop"]) {
          document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
        }
        return now;
      },
      { name: basename(path), data },
    );
    const opened = await page
      .locator("[data-page]")
      .first()
      .waitFor({ timeout: 2_000 })
      .then(
        () => true,
        () => false,
      );
    if (opened) break;
  }
  return (await paintTime(page, 1)) - start;
}

/** @param page Browser tab. @returns The open command input. */
export async function openPalette(page: Page) {
  const search = page.getByRole("button", { name: "Search", exact: true });
  if (await search.isVisible()) await search.click();
  else await page.keyboard.press("ControlOrMeta+k");
  return page.getByRole("combobox").filter({ visible: true }).last();
}

/** @param page Browser tab. @param query Palette expression. @returns When the selected action runs. */
export async function palette(page: Page, query: string) {
  const input = await openPalette(page);
  await input.fill(query);
  await page.getByRole("listbox", { name: "Results" }).getByRole("option").first().click();
}

/** @param page Browser tab. @param path Output path. @param trigger Export action. @returns When bytes reach disk. */
export async function download(page: Page, path: string, trigger = () => page.keyboard.press("ControlOrMeta+s")) {
  const pending = page.waitForEvent("download");
  await trigger();
  await (await pending).saveAs(path);
}

/** @param path PDF path. @returns Independent page text, annotation types and field names. */
export function inspectPdf(path: string): { text: string; annotations: string[]; fields: string[] } {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        [
          "import json,sys",
          "from pypdf import PdfReader",
          "r=PdfReader(sys.argv[1])",
          "a=[str(ref.get_object()['/Subtype']) for p in r.pages for ref in p.get('/Annots',[])]",
          "print(json.dumps(dict(text=r.pages[0].extract_text(),annotations=a,fields=list(r.get_fields() or {}))))",
        ].join("\n"),
        path,
      ],
      { encoding: "utf8" },
    ),
  );
}

/** @param target Visible element. @returns Bounding rectangle. */
export async function bounds(target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Missing bounds for " + target);
  return box;
}

/**
 * Double-clicks the middle of an element by position. The page's own hit surface sits above the line outlines and
 * resolves the line itself, so element-targeted clicks would be reported as intercepted.
 * @param page Browser tab.
 * @param target Element to double-click.
 * @returns After the double-click.
 */
export async function dblclickCenter(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await bounds(target);
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
}

/** @param page Browser tab. @param word Replacement word. @returns Edited and original line text. */
export async function editWord(page: Page, word: string) {
  await palette(page, ">Edit text");
  await dblclickCenter(page, page.getByRole("button", { name: /^Edit text: .*\p{L}/u }).first());
  const input = page.getByLabel("Page text", { exact: true });
  const before = await input.innerText();
  const after = before.replace(/\p{L}[\p{L}\p{M}]*/u, word);
  expect(after).not.toBe(before);
  await input.press("ControlOrMeta+a");
  await input.press("ArrowLeft");
  const match = /\p{L}[\p{L}\p{M}]*/u.exec(before)!;
  for (let i = 0; i < match.index; i++) await input.press("ArrowRight");
  for (let i = 0; i < [...match[0]].length; i++) await input.press("Shift+ArrowRight");
  await page.keyboard.insertText(word);
  await input.press("Enter");
  await expect(input).toBeHidden();
  await expect(page.getByRole("button", { name: new RegExp("Edit text: .*" + word) }).first()).toBeVisible();
  return { before, after };
}

/** @param page Browser tab. @param tool Gesture tool. @param line Screen rectangle to mark. @returns After drag. */
export async function stroke(page: Page, tool: string, line: { x: number; y: number; width: number; height: number }) {
  await palette(page, ">" + tool);
  const y = line.y + line.height / 2;
  await page.mouse.move(line.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(line.x + line.width - 2, y, { steps: 8 });
  await page.mouse.up();
}

/** @param page Browser tab. @param touch Place with touchscreen. @returns After placing the signature. */
/** @param page Browser tab. @param touch Place with touchscreen. @returns After the signature is placed. */
export async function sign(page: Page, touch: boolean) {
  await palette(page, ">Fit page");
  await palette(page, ">Sign");
  const dialog = page.getByRole("dialog", { name: "Add your signature" });
  const box = await bounds(await rendered(page));
  const x = box.x + box.width * 0.5;
  // Desktop: bottom of the page, clear of the form fields. Phone: upper page, clear of the floating tool card.
  const y = box.y + box.height * (touch ? 0.3 : 0.9);
  /** @returns After a placement gesture at the chosen signature position. */
  const place = () => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const create = page.getByRole("button", { name: "New signature" });
  if (await create.isVisible()) await create.click();
  else await place();
  await dialog.getByText("Type", { exact: true }).click();
  await dialog.getByLabel("Your name").fill("Ada Harbour");
  await dialog.getByRole("button", { name: "Use signature" }).click();
  await expect(dialog).toBeHidden();
  await place();
  await expect(page.locator('[data-page] [data-annotation][aria-label="Image"]')).toHaveCount(1);
}

/**
 * @param page Browser tab.
 * @param webkit Dispatch Safari gesture events.
 * @param inward Reverse gesture.
 * @returns After lift.
 */
export async function pinch(page: Page, webkit: boolean, inward = false) {
  const view = page.getByLabel("Document pages");
  const box = await bounds(view);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const radii = inward ? [75, 60, 45, 30] : [30, 45, 60, 75];
  if (webkit) {
    await view.evaluate(
      (el, { x, y, inward }) => {
        for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
          const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
          Object.defineProperty(event, "scale", { value: type === "gesturestart" ? 1 : inward ? 0.4 : 2.5 });
          if (el.dispatchEvent(event)) throw new Error("App did not cancel Safari " + type);
        }
      },
      { x, y, inward },
    );
    return;
  }
  const session = await page.context().newCDPSession(page);
  try {
    for (const [i, radius] of radii.entries()) {
      await session.send("Input.dispatchTouchEvent", {
        type: i ? "touchMove" : "touchStart",
        touchPoints: [
          { x: x - radius, y, id: 1 },
          { x: x + radius, y, id: 2 },
        ],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
}
