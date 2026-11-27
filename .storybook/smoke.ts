import { isAbsolute, relative, resolve } from "node:path";
import { chromium } from "playwright";

const output = resolve("storybook-static");
const index: { entries: Record<string, { type: string }> } = await Bun.file(resolve(output, "index.json")).json();
const ids = Object.entries(index.entries)
  .filter(([, entry]) => entry.type === "story")
  .map(([id]) => id);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  /** @param request A request from the isolated browser. @returns A built Storybook asset. */
  async fetch(request) {
    const path = resolve(output, "." + new URL(request.url).pathname);
    const asset = Bun.file(path);
    const local = relative(output, path);
    if (local.startsWith("..") || isAbsolute(local) || !(await asset.exists())) {
      return new Response(null, { status: 404 });
    }
    return new Response(asset);
  },
});

try {
  const executablePath = process.env.STORYBOOK_CHROME;
  const browser = await chromium.launch({ executablePath });
  try {
    const failures: string[] = [];
    /** @returns Nothing once this browser worker has checked its stories. */
    const check = async () => {
      const page = await browser.newPage();
      let errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (let id = ids.shift(); id; id = ids.shift()) {
        errors = [];
        try {
          await page.setViewportSize({ width: /phone|sheet/.test(id) ? 390 : 1440, height: 900 });
          await page.goto(new URL(`iframe.html?id=${id}&viewMode=story`, server.url).href);
          await page.waitForFunction(
            () => {
              const root = document.getElementById("storybook-root");
              return (
                !!root?.firstElementChild && !/^Opening sample PDF…|^Reading sample text…/.test(root.textContent ?? "")
              );
            },
            undefined,
            { timeout: 12_000 },
          );
          const alert = await page
            .locator("#storybook-root [role=alert], .sb-show-errordisplay #error-message")
            .allTextContents();
          if (errors.length || alert.length) throw new Error([...errors, ...alert].join(" / "));
          if (id === "primitives-dialog--confirmation") {
            await page.getByRole("button", { name: "Open dialog" }).click();
            await page.locator("dialog[open]").waitFor();
            await page.keyboard.press("Escape");
            await page.locator("dialog[open]").waitFor({ state: "hidden" });
          }
          if (id === "primitives-dropdownmenu--default") {
            await page.getByRole("button", { name: "Zoom" }).press("Enter");
            await page.getByRole("menu", { name: "Zoom" }).waitFor();
            await page.keyboard.press("Escape");
            await page.getByRole("menu", { name: "Zoom" }).waitFor({ state: "hidden" });
          }
          if (id === "text-formatting-fontpicker--default") {
            await page.getByRole("combobox", { name: "Search fonts" }).fill("Helvetica");
            await page
              .getByRole("listbox", { name: "Fonts" })
              .getByRole("option", { name: /Helvetica/ })
              .first()
              .waitFor();
          }
        } catch (error) {
          failures.push(`${id}: ${errors[0] ?? String(error)}`);
        }
      }
      await page.close();
    };
    const count = ids.length;
    await Promise.all([check(), check()]);
    if (failures.length) throw new Error(failures.join("\n"));
    console.log(`Passed ${count} Storybook browser checks.`);
  } finally {
    await browser.close();
  }
} finally {
  server.stop(true);
}
