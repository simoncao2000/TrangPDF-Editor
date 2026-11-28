import { describe, expect, it } from "bun:test";
import { plainComment, PLAIN_COMMENT_STYLE } from "../annotations/comment";
import { decodeComment, encodeComment, MAX_COMMENT_XHTML } from "./comment-xhtml";

describe("PDF rich comment XHTML", () => {
  it("round trips formatting, coalesces runs and escapes the plain text", () => {
    const format = { ...PLAIN_COMMENT_STYLE, bold: true, italic: true, underline: true, ink: "blue" } as const;
    const body = [{ ...format, text: "A & B" }, { ...format, text: '\r\n<"test"> \' 🌊' }, ...plainComment(" done")];
    const { plain, rich } = encodeComment(body);
    expect(plain).toBe('A & B\r\n<"test"> \' 🌊 done');
    expect(rich).toContain("A &amp; B&#13;<br/>&lt;&quot;test&quot;&gt; &apos; 🌊");
    expect(rich).toContain('<span style="text-decoration:underline;color:#');
    expect(rich.match(/<b>/g)).toHaveLength(1);
    expect(decodeComment(rich, plain)).toEqual([
      { ...format, text: 'A & B\r\n<"test"> \' 🌊' },
      ...plainComment(" done"),
    ]);
  });

  it("inherits supported nested styles and keeps only the words of unknown elements", () => {
    const rich = `
      <?xml version="1.0"?>
      <body><p>One <b><i><span style='color:#2a70b1;text-decoration:underline;font-family:Arial'>
      </span><span style='color:#2a70b1;text-decoration:underline'><u>two</u></span></i></b></p>
      <p><a href="x>y"><span style="color:#ffffff;font-size:100px">three</span></a><br/>four</p></body>`;
    expect(decodeComment(rich.replace(">\n      </span>", "></span>"), "fallback")).toEqual([
      ...plainComment("One "),
      { text: "two", bold: true, italic: true, underline: true, ink: "blue" },
      ...plainComment("\nthree\nfour"),
    ]);
  });

  it("decodes entities as text and discards script, style and comment text", () => {
    const rich =
      "<p>&lt;b&gt; &amp; &quot; &apos; &#65;&#x1F30A;" +
      "<script>if (x < y) { danger() }</script><style>ignore { color: red }</style><!-- secret --></p>";
    expect(decodeComment(rich, "fallback")).toEqual(plainComment("<b> & \" ' A🌊"));
  });

  it("uses /Contents for missing, oversized, malformed or unclosed markup", () => {
    const examples = ["", "<p><b>bad</p>", "<p>bad", '<p title="bad>text</p>', "x".repeat(MAX_COMMENT_XHTML + 1)];
    for (const rich of examples) expect(decodeComment(rich, "original")).toEqual(plainComment("original"));
  });

  it("writes plain black comments only to /Contents", () => {
    expect(encodeComment(plainComment("a\nb"))).toEqual({ plain: "a\nb", rich: "" });
  });
});
