import { expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTextCover } from "./PageTextCover";

it.each(["Dean List 7 times recipient", "Dean", ""])("covers the full source line while displaying %j", (draft) => {
  const markup = renderToStaticMarkup(
    <PageTextCover background="rgb(20, 40, 90)" width={283} height={24}>
      <span contentEditable suppressContentEditableWarning>
        {draft}
      </span>
    </PageTextCover>,
  );
  expect(markup).toContain("background-color:rgb(20, 40, 90)");
  expect(markup).toContain("min-width:283px");
  expect(markup).toContain("min-height:24px");
});
