import { expect, mock, test } from "bun:test";
import { createDocumentSession, movePageText, pdfRectToScreen, type PageFrame } from "@pdf-editor/core";
import { corpusFile, createTestEngine } from "../../../../core/src/testing/fixtures";
import type { PointerEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DrawingSurface } from "../annotations/DrawingSurface";
import { openTextHit, pageHit } from "./page-hit";
import { useAnnotationUi } from "../../state/annotation-store";
import { EditorContext, type EditorContextValue } from "../../editor/context";
import { onLineEdge, useTextDrag, type TextDrag } from "./use-text-drag";

/** @returns The fixture page and a session with real hit testing and undo. */
async function openPage() {
  const session = createDocumentSession(await createTestEngine());
  await session.load({ name: "text.pdf", bytes: corpusFile("text.pdf") });
  return { session, page: session.store.getState().pages[0]!.id };
}

test("Select double-click opens the hit line for editing and inserts on empty paper", async () => {
  const { session, page } = await openPage();
  const edit = mock();
  const insert = mock();
  const hit = await pageHit(session, page, { x: 100, y: 708 });
  openTextHit(hit, edit, insert);
  expect(edit).toHaveBeenCalledWith(hit);
  expect(insert).not.toHaveBeenCalled();
  const secondLine = await session.textObjectAt(page, { x: 100, y: 680 });
  if (secondLine) openTextHit(secondLine, edit, insert);
  expect(edit).toHaveBeenLastCalledWith(secondLine);
  openTextHit(await pageHit(session, page, { x: 10, y: 10 }), edit, insert);
  expect(insert).toHaveBeenCalledTimes(1);
  expect(edit).toHaveBeenCalledTimes(2);
});

test("only the edge starts a line drag and undo restores its position", async () => {
  const { session, page } = await openPage();
  const from = { x: 100, y: 708 };
  const object = (await session.textObjectAt(page, from))!;
  const frame: PageFrame = { cropBox: { x: 0, y: 0, width: 612, height: 792 }, zoom: 1, rotation: 0 };
  const box = pdfRectToScreen(object.bounds, frame);
  const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  expect(onLineEdge(box, center)).toBe(false);
  expect(onLineEdge(box, { ...center, x: box.left - 5 })).toBe(true);
  let drag!: TextDrag;
  /** @returns An empty render that initializes the pointer handlers. */
  function Harness() {
    drag = useTextDrag(frame, (line, dx, dy) =>
      session.dispatch((content) => movePageText(content, page, line, { dx, dy })),
    );
    return null;
  }
  renderToStaticMarkup(<Harness />);
  const press = {
    clientX: box.left,
    clientY: center.y,
    pointerId: 1,
    button: 0,
    currentTarget: { setPointerCapture: mock() },
    stopPropagation: mock(),
  } as unknown as PointerEvent<SVGElement>;
  const release = { ...press, clientY: center.y + 100 };
  drag.onPointerDown(press, object);
  drag.onPointerMove(release);
  drag.onPointerUp(release);
  await session.settled();
  expect(await session.textObjectAt(page, from)).toBeNull();
  session.undo();
  expect((await session.textObjectAt(page, from))?.bounds).toEqual(object.bounds);
});

test.each(["ink", "highlight"] as const)("%s cursor uses a fine 14px nib", (tool) => {
  const frame: PageFrame = { cropBox: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, zoom: 1 };
  const markup = renderToStaticMarkup(
    <EditorContext.Provider value={{} as EditorContextValue}>
      <svg>
        <DrawingSurface
          pageId="page"
          tool={tool}
          style={useAnnotationUi.getState().styles[tool]}
          frame={frame}
          width={100}
          height={100}
          onCreate={mock()}
          onTextAt={mock()}
        />
      </svg>
    </EditorContext.Provider>,
  );
  const svg = decodeURIComponent(markup);
  expect(svg).toContain('width="14"');
  expect(svg).toContain('stroke-width="2"');
  expect(svg).toContain('stroke-width="1"');
  expect(svg).toContain('fill="#2a2a26"');
  expect(svg).not.toContain("M12 19h8");
});
