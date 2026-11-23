import { createMemoryHistory } from "@tanstack/react-router";
import { expect, test } from "bun:test";
import { createEditorRouter } from "./router";
import { closeViewPanel, openViewPanel, readView, setViewMode, writeView } from "./view-history";

test("Back dismisses the panel, leaves organize, then follows the underlying history", async () => {
  const history = createMemoryHistory({ initialEntries: ["/?previous=true", "/"] });
  const router = createEditorRouter(history);

  /**
   * Loads the current entry and reads the search validated by the root route.
   * @returns The root match's view search.
   */
  async function search() {
    await router.load();
    return router.state.matches[0]?.search;
  }

  expect(await search()).toMatchObject({ mode: "read" });
  expect(router.buildLocation({ to: "/", search: true, _includeValidateSearch: true }).href).toBe("/");
  setViewMode(history, "organize");
  openViewPanel(history, "comments");
  expect(await search()).toMatchObject({ mode: "organize", panel: "comments" });

  history.back();
  expect(await search()).toEqual({ mode: "organize", page: 1, zoom: "fit-width" });
  history.back();
  expect(await search()).toEqual({ mode: "read", page: 1, zoom: "fit-width" });
  history.back();
  expect(history.location.href).toBe("/?previous=true");
});

test("the reader replaces its entry and panel dismissal navigates back", () => {
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const { history: editorHistory } = createEditorRouter(history);
  writeView(editorHistory, { ...readView(editorHistory), page: 3, zoom: 1.25 }, true);
  expect(history.length).toBe(1);

  openViewPanel(editorHistory, "properties");
  openViewPanel(editorHistory, "comments");
  expect(history.length).toBe(2);
  expect(readView(editorHistory).panel).toBe("comments");
  closeViewPanel(editorHistory);
  expect(history.location.href).toBe("/?page=3&zoom=1.25");
  expect(history.canGoBack()).toBe(false);
});

test("a palette action runs after the palette entry has been dismissed", () => {
  const history = createMemoryHistory({ initialEntries: ["/"] });
  openViewPanel(history, "search");

  closeViewPanel(history, () => {
    expect(readView(history).panel).toBeUndefined();
    setViewMode(history, "organize");
  });

  expect(readView(history)).toMatchObject({ mode: "organize" });
  history.back();
  expect(history.location.href).toBe("/");
});
