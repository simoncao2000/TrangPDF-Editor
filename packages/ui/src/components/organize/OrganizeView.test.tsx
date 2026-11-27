import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WideOrganizeHeader } from "./OrganizeView";

test.each([false, true])("wide organize header keeps Done after the selection action", (allSelected) => {
  const actions = { insert: mock(), toggle: mock(), done: mock() };
  const markup = renderToStaticMarkup(
    <WideOrganizeHeader count={3} busy={false} allSelected={allSelected} {...actions} />,
  );
  const buttons = [...markup.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)].map((match) =>
    match[1]!.replace(/<[^>]*>/g, ""),
  );
  expect(buttons).toEqual(["Insert pages…", allSelected ? "Clear selection" : "Select all", "Done"]);
  expect(markup.indexOf("Organize")).toBeLessThan(markup.indexOf("<button"));
  expect(markup).not.toContain("mr-auto");
});
