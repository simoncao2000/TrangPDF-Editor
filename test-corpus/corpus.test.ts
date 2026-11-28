import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const folder = import.meta.dir;
const readme = readFileSync(join(folder, "README.md"), "utf8");
const files = [...readme.matchAll(/^\|\s*([^|]+?\.pdf)\s*\|/gm)].map((match) => match[1]!);

test("the README lists exactly the corpus PDFs", () => {
  const actual = readdirSync(folder).filter((name) => name.endsWith(".pdf"));
  expect([...files].sort()).toEqual(actual.sort());
});

for (const name of files) {
  test(name, async () => {
    const file = Bun.file(join(folder, name));
    expect(await file.exists()).toBe(true);
    if (name !== "large-1000-pages.pdf") expect(file.size).toBeLessThan(200_000);
    if (name !== "not-a-pdf.pdf" && name !== "damaged.pdf") {
      expect(await file.slice(0, 5).text()).toBe("%PDF-");
    }
  });
}
