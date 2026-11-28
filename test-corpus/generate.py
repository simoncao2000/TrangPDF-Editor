"""Generate the TrangPDF regression corpus from local assets."""
import argparse
import random
import re
import struct
import tempfile
import zlib
from functools import partial
from io import BytesIO
from unittest.mock import patch

from pathlib import Path

HERE = Path(__file__).parent


def write_pdf_objects(objs):
    """Serializes PDF object bodies to bytes with an xref table and catalog at object 1."""
    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + (body.encode() if isinstance(body, str) else body) + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def build_pdf(pages, annots=None):
    """Writes a minimal valid PDF.
    pages: list of (width_pt, height_pt, rotate, rgb) tuples.
    annots: optional annotation dictionaries (as PDF source) placed on the first page."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None]
    kids = []
    for index, (w, h, rot, (r, g, b)) in enumerate(pages):
        content = f"{r} {g} {b} rg 36 36 {w - 72} {h / 2} re f".encode()
        objs.append(f"<< /Length {len(content)} >>\nstream\n{content.decode()}\nendstream")
        cid = len(objs)
        annot_refs = ""
        if index == 0 and annots:
            refs = []
            for annot in annots:
                objs.append(annot)
                refs.append(f"{len(objs)} 0 R")
            annot_refs = f" /Annots [{' '.join(refs)}]"
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] /Rotate {rot} /Contents {cid} 0 R{annot_refs} >>")
        kids.append(f"{len(objs)} 0 R")
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"
    return write_pdf_objects(objs)


def three_pages():
    """Return the original three coloured pages."""
    return build_pdf([(612, 792, 0, (0.1, 0.3, 0.5)), (595, 842, 0, (0.8, 0.6, 0.2)), (612, 792, 90, (0.2, 0.6, 0.4))])


def encrypted(algorithm="RC4-128", password="harbour", permissions=None):
    """Encrypt the original pages with reproducible test-only salts and IVs."""
    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter(clone_from=PdfReader(BytesIO(three_pages())))
    options = {} if permissions is None else {"permissions_flag": permissions}
    with patch("secrets.token_bytes", random.Random(6981).randbytes):
        writer.encrypt(password, "harbour-owner", algorithm=algorithm, **options)
        buffer = BytesIO()
        writer.write(buffer)
    return buffer.getvalue()


def annotated():
    """Return the original imported square and stamp."""
    return build_pdf(
        [(612, 792, 0, (0.9, 0.9, 0.9))],
        annots=[
            "<< /Type /Annot /Subtype /Square /Rect [100 600 200 700] /C [1 0 0] /Border [0 0 4] >>",
            "<< /Type /Annot /Subtype /Stamp /Rect [300 600 450 650] /Name /Approved /NM (stamp-from-elsewhere) >>",
        ],
    )


def form_pdf():
    """Builds a one-page AcroForm with six typed widgets and one widget without a field type."""
    widget = "/Type /Annot /Subtype /Widget /P 3 0 R /F 4"
    off = "0 G 1 1 14 14 re S"
    on = off + " 4 4 8 8 re f"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R /AcroForm 4 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Annots [5 0 R 6 0 R 14 0 R 8 0 R 9 0 R 10 0 R 15 0 R] >>",
        "<< /Fields [5 0 R 6 0 R 14 0 R 7 0 R 10 0 R 15 0 R] "
        "/DA (/Helv 12 Tf 0 g) /DR << /Font << /Helv 11 0 R >> >> >>",
        f"<< {widget} /Rect [72 690 372 712] /FT /Tx /T (full_name) /Ff 2 /V () >>",
        f"<< {widget} /Rect [72 620 88 636] /FT /Btn /T (contact) /V /Off /AS /Off "
        "/AP << /N << /Off 12 0 R /Yes 13 0 R >> >> >>",
        "<< /FT /Btn /Ff 32768 /Kids [8 0 R 9 0 R] /T (visit) /V /first >>",
        f"<< {widget} /Rect [72 570 88 586] /Parent 7 0 R /AS /first "
        "/AP << /N << /Off 12 0 R /first 13 0 R >> >> >>",
        f"<< {widget} /Rect [72 545 88 561] /Parent 7 0 R /AS /Off "
        "/AP << /N << /Off 12 0 R /returning 13 0 R >> >> >>",
        f"<< {widget} /Rect [72 490 272 512] /NM (site-widget) /FT /Ch /Ff 131072 /T (site) "
        "/Opt [(Headland) (Harbour) (Dunes)] /V (Headland) >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for appearance in (off, on):
        objs.append(
            f"<< /Type /XObject /Subtype /Form /BBox [0 0 16 16] /Length {len(appearance)} >>\n"
            f"stream\n{appearance}\nendstream"
        )
    objs.append(f"<< {widget} /Rect [72 595 88 611] /T (untyped) >>")
    objs.append(
        f"<< {widget} /Rect [72 450 272 472] /NM (alternate-site-widget) /FT /Ch /Ff 131072 "
        "/T (alternate_site) /Opt [(Headland) (Harbour) (Dunes)] /V () >>"
    )
    return write_pdf_objects(objs)





def text_pdf(content, font):
    """Writes a one-page PDF (612 x 792) whose resources have a single font /F1.
    content: the page's content stream (bytes). font: the /F1 font dictionary (PDF source)."""
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(content)} >>\nstream\n{content.decode()}\nendstream",
        font,
    ]
    return write_pdf_objects(objs)


# Real text in Helvetica: two lines, for text selection and highlights.
def plain_text():
    """Build the original two-line text sample."""
    return text_pdf(
        b"BT /F1 24 Tf 72 700 Td (Tide tables for the headland) Tj 0 -30 Td (Check before you walk) Tj ET",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    )

# A line as pdfTeX writes it: no space characters, word gaps are TJ offsets, and the width table
# gives every unused code (the space included) a width of 0.
HELVETICA_WIDTHS = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
    556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
    556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
zero_space_widths = " ".join(str(w) for w in [0] + HELVETICA_WIDTHS[1:])
def latex_spaces():
    """Build the original latex-spaces text sample."""
    return text_pdf(
        b"BT /F1 24 Tf 72 700 Td [(Dean) -600 (List) -600 (7) -600 (times) -600 (recipient)] TJ ET",
        f"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [{zero_space_widths}] >>",
    )

FONTS = HERE.parent / "packages/ui/src/assets/fonts"
ARABIC = (HERE.parent / "packages/ui/node_modules/@fontsource-variable/playpen-sans-arabic/files"
          / "playpen-sans-arabic-arabic-wght-normal.woff2")
HELV = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"


def stream(content, attrs=""):
    """Serialize a possibly binary stream with its exact byte length."""
    data = content.encode() if isinstance(content, str) else content
    return f"<< {attrs} /Length {len(data)} >>\nstream\n".encode() + data + b"\nendstream"


def page(content, resources="", extra=()):
    """Build a page with caller-supplied resources starting at object five."""
    return write_pdf_objects([
        "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << {resources} >> /Contents 4 0 R >>",
        stream(content), *extra,
    ])


def canvas_pdf(draw):
    """Serialize a ReportLab drawing with fixed timestamps and document ID."""
    from reportlab.pdfgen.canvas import Canvas

    buf = BytesIO()
    canvas = Canvas(buf, pagesize=(612, 792), invariant=1)
    draw(canvas)
    canvas.save()
    return buf.getvalue()


def standard_fonts(c):
    """Draw the fourteen standard fonts, including each Latin style."""
    from reportlab.pdfbase import pdfmetrics

    for i, font in enumerate(pdfmetrics.standardFonts):
        c.setFont(font, 16)
        c.drawString(48, 730 - 42 * i, font)


def script_font():
    """Reassemble the local Allura WOFF1 tables as a TrueType font for ReportLab."""
    from reportlab.pdfbase.ttfonts import TTFont, TTFontMaker

    path = HERE.parent / "packages/ui/node_modules/@fontsource/allura/files/allura-latin-400-normal.woff"
    data = path.read_bytes()
    count = struct.unpack_from(">H", data, 12)[0]
    maker = TTFontMaker()
    for tag, offset, packed, length, _ in struct.iter_unpack(">4sIIII", data[44:44 + 20 * count]):
        table = data[offset:offset + packed]
        maker.add(tag.decode(), zlib.decompress(table) if packed < length else table)
    return TTFont("Allura", BytesIO(maker.makeStream()))


def subset_fonts(c):
    """Place different embedded fonts, sizes and colours on the same baseline."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    line = c.beginText(48, 640)
    for i, (font, label) in enumerate(zip(("inter", "lora", "jet-brains-mono", "nunito", "playpen-sans"),
                                          ("Harbour ", "tide ", "08:30 ", "on ", "Friday"))):
        pdfmetrics.registerFont(TTFont(font, str(FONTS / (font + ".ttf"))))
        line.setFont(font, 13 + 3 * i)
        line.setFillColorRGB(i / 5, 0.2, 0.7 - i / 8)
        line.textOut(label)
    pdfmetrics.registerFont(script_font())
    line.setFont("Allura", 23)
    line.textOut(" morning")
    c.drawText(line)


def unicode_map(chars, digits):
    """Map fixture character codes, starting at one, to Unicode."""
    mappings = "\n".join(f"<{i:0{digits}X}> <{ord(ch):04X}>" for i, ch in enumerate(chars, 1))
    return stream(f"""/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Fixture def /CMapType 2 def
1 begincodespacerange <{'0' * digits}> <{'F' * digits}> endcodespacerange
{len(chars)} beginbfchar
{mappings}
endbfchar endcmap CMapName currentdict /CMap defineresource pop end end""")


def cid_font():
    """Embed a Lora subset with Identity-H CIDs and an explicit Unicode map."""
    from reportlab.pdfbase.ttfonts import TTFont

    label = "Tiếng Việt ở Huế · café déjà vu"
    chars = list(dict.fromkeys(label))
    face = TTFont("CID", str(FONTS / "lora.ttf")).face
    subset = face.makeSubset(list(map(ord, chars)))
    widths = " ".join(str(round(face.charWidths[ord(ch)])) for ch in chars)
    encoded = "".join(f"{chars.index(ch) + 1:04X}" for ch in label)
    name = "/ABCDEF+Lora"
    return page(f"BT /F 24 Tf 48 640 Td <{encoded}> Tj ET", "/Font << /F 5 0 R >>", [
        f"<< /Type /Font /Subtype /Type0 /BaseFont {name} /Encoding /Identity-H "
        "/DescendantFonts [6 0 R] /ToUnicode 9 0 R >>",
        f"<< /Type /Font /Subtype /CIDFontType2 /BaseFont {name} /CIDToGIDMap /Identity "
        f"/FontDescriptor 7 0 R /W [1 [{widths}]] /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>",
        f"<< /Type /FontDescriptor /FontName {name} /Flags 34 /FontBBox [{' '.join(map(str, face.bbox))}] "
        f"/Ascent {face.ascent} /Descent {face.descent} /CapHeight {face.capHeight} /ItalicAngle 0 /StemV 80 /FontFile2 8 0 R >>",
        stream(subset, f"/Length1 {len(subset)}"), unicode_map(chars, 4),
    ])


def subset_edit():
    """Place the first five subset glyphs under a large, anisotropic text matrix."""
    content = ("BT /F 1 Tf 8.08 0 0 10.1 48 640 Tm <00010002000300040005> Tj ET "
               "BT /T 10.1 Tf 1 0 0 1 69.2 640 Tm (next) Tj ET "
               "BT /T 10.1 Tf 1 0 0 1 48 600 Tm (Medical Device Packaging) Tj ET")
    resources = "/Font << /F 5 0 R /T << /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >> >>"
    # Reuse the CID fixture's exact embedded subset and widths (objects 5 through 9).
    source = (HERE / "fonts-cid-unicode.pdf").read_bytes()
    xref = int(source.rsplit(b"startxref\n", 1)[1].splitlines()[0])
    offsets = [int(entry[:10]) for entry in source[xref:].splitlines()[2:12]] + [xref]
    objects = [source[offsets[i]:offsets[i+1]].split(b"\n", 1)[1].removesuffix(b"\nendobj\n") for i in range(5, 10)]
    return page(content, resources, objects)


def type3():
    """Draw a triangular glyph defined by a Type3 CharProc."""
    return page("BT /F 48 Tf 50 650 Td (AAA) Tj ET", "/Font << /F 5 0 R >>", [
        "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 600 700] /FontMatrix [.001 0 0 .001 0 0] "
        "/Encoding << /Type /Encoding /Differences [65 /A] >> /FirstChar 65 /LastChar 65 /Widths [650] "
        "/Resources << >> /CharProcs << /A 6 0 R >> >>",
        stream("650 0 0 0 600 700 d1 0 0 m 300 700 l 600 0 l h f"),
    ])


def arabic():
    """Embed bitmap glyphs from Playpen Sans Arabic for the non-joining letters of ورد."""
    from PIL import Image, ImageDraw, ImageFont

    chars = "ورد"
    font = ImageFont.truetype(str(ARABIC), 96)
    procs, widths = [], []
    for ch in chars:
        left, top, right, bottom = font.getbbox(ch, anchor="ls")
        mask = Image.new("1", (right-left, bottom-top))
        ImageDraw.Draw(mask).text((-left, -top), ch, font=font, fill=1, anchor="ls")
        width = round(font.getlength(ch))
        widths.append(str(width))
        procs.append(stream(f"{width} 0 d0 q {mask.width} 0 0 {mask.height} {left} {-bottom} cm "
                            f"BI /W {mask.width} /H {mask.height} /IM true /BPC 1 /D [1 0] /F /AHx ID "
                            f"{mask.tobytes().hex()}> EI Q"))
    dictionary = ("<< /Type /Font /Subtype /Type3 /FontBBox [-96 -96 192 192] /FontMatrix [.01041667 0 0 .01041667 0 0] "
                  "/Encoding << /Type /Encoding /Differences [1 /waw /reh /dal] >> /FirstChar 1 /LastChar 3 "
                  f"/Widths [{' '.join(widths)}] /Resources << >> /ToUnicode 9 0 R "
                  "/CharProcs << /waw 6 0 R /reh 7 0 R /dal 8 0 R >> >>")
    return page("BT /F 40 Tf 420 650 Td <030201> Tj ET", "/Font << /F 5 0 R >>",
                [dictionary, *procs, unicode_map(chars, 2)])


def form_xobject():
    """Put selectable text inside a reusable Form XObject."""
    form = stream("BT /F 20 Tf 0 8 Td (Inside the form) Tj ET",
                  "/Type /XObject /Subtype /Form /BBox [0 0 200 40] /Resources << /Font << /F 6 0 R >> >>")
    return page("q 1 0 0 1 50 650 cm /Panel Do Q", "/XObject << /Panel 5 0 R >>", [form, HELV])


def transforms():
    """Apply three distinct text matrices directly inside a text object."""
    return text_pdf(b"BT /F1 20 Tf 0 1 -1 0 100 500 Tm (Rotated) Tj 1 .3 .2 1 160 500 Tm (Skew) Tj "
                    b"1.8 0 0 .7 250 500 Tm (Scaled) Tj ET", HELV)


def numbered(c, count):
    """Draw visible page numbers and optional labels and nested bookmarks."""
    for i in range(count):
        if count == 5:
            if i in (0, 2):
                c.addPageLabel(i, "ROMAN_LOWER" if i == 0 else "ARABIC", start=1)
            c.bookmarkPage(str(i))
            c.addOutlineEntry(f"Section {i + 1}", str(i), level=int(i in (1, 3, 4)))
        c.drawString(60, 680, f"Page {i + 1}")
        c.showPage()


def page_boxes(kind):
    """Build labelled pages with explicit sizes, crops or an inherited rotation."""
    sizes = [(595, 842), (612, 792), (842, 1191), (2384, 3370), (100, 100), (792, 612)]
    boxes = sizes if kind == "sizes" else [(612, 792)] * (5 if kind == "rotate" else 1)
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None, HELV]
    kids = []
    for i, (w, h) in enumerate(boxes):
        kids.append(f"{len(objs) + 1} 0 R")
        attrs = "/CropBox [36 48 540 720]" if kind == "crop" else ""
        if kind == "rotate" and i < 4:
            attrs = f"/Rotate {90 * i}"
        objs.extend([f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] {attrs} "
                     f"/Resources << /Font << /F 3 0 R >> >> /Contents {len(objs) + 2} 0 R >>",
                     stream(f"BT /F 12 Tf {50 if kind == 'crop' else 8} {h - 84} Td (Page {i + 1}) Tj ET")])
    inherited = "/Rotate 90" if kind == "rotate" else ""
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} {inherited} >>"
    return write_pdf_objects(objs)


def annotations(kind):
    """Build separated markup rectangles, a reply chain, or distinct flag combinations."""
    subtypes = ("Highlight Underline StrikeOut Squiggly Ink Square Circle Line Polygon "
                "FreeText Text Stamp Link").split() if kind == "all" else ["Text"] * 3
    annots = []
    for i, subtype in enumerate(subtypes):
        y = 725 - i * 50
        quad = f"/QuadPoints [50 {y+24} 240 {y+24} 50 {y} 240 {y}]"
        points = f"60 {y+3} 140 {y+22} 215 {y+8}"
        attrs = {
            "Highlight": quad, "Underline": quad, "StrikeOut": quad, "Squiggly": quad,
            "Ink": f"/InkList [[{points}]]", "Line": f"/L [58 {y+4} 230 {y+20}] /LE [/OpenArrow /ClosedArrow]",
            "Polygon": f"/Vertices [{points}]", "FreeText": "/DA (/Helv 12 Tf 0 g)",
            "Stamp": "/Name /Approved", "Link": "/Dest [3 0 R /Fit]",
        }.get(subtype, "")
        contents = subtype
        if kind == "threads":
            contents = ["Review this page", "First reply", "Nested reply"][i]
            attrs = (f"/IRT {4+i} 0 R /RT /R" if i else
                     "/RC (<body xmlns='http://www.w3.org/1999/xhtml'><p>Review <b>this page</b></p></body>)")
        flags = [2, 36, 132][i] if kind == "flags" else 4
        annots.append(f"<< /Type /Annot /Subtype /{subtype} /Rect [48 {y-2} 242 {y+26}] /T (Reviewer) "
                      f"/Contents ({contents}) /C [1 .55 0] /F {flags} {attrs} >>")
    refs = " ".join(f"{5+i} 0 R" for i in range(len(annots)))
    labels = " ".join(f"BT /Helv 14 Tf 50 {730-i*50} Td ({s} sample) Tj ET" for i, s in enumerate(subtypes))
    return write_pdf_objects(["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
                              f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [{refs}] "
                              f"/Resources << /Font << /Helv {5+len(annots)} 0 R >> >> /Contents 4 0 R >>",
                              stream(labels), *annots, HELV])


def field_fixture(kind):
    """Extend the legacy form with specialised widgets or exercise missing appearances."""
    from pypdf import PdfReader, PdfWriter

    from pypdf.generic import BooleanObject, NameObject, TextStringObject
    writer = PdfWriter(clone_from=PdfReader(BytesIO(form_pdf())))
    form = writer.root_object["/AcroForm"]
    widgets = writer.pages[0]["/Annots"]
    if kind == "all":
        from pypdf.generic import read_object
        for i, (name, attrs) in enumerate([
            ("notes", "/FT /Tx /Ff 4096"), ("secret", "/FT /Tx /Ff 8192"),
            ("amount", r'/FT /Tx /AA << /F << /S /JavaScript /JS (AFNumber_Format\(2,0,0,0,"",true\);) >> >>'),
            ("short_code", "/FT /Tx /MaxLen 5"), ("reference", "/FT /Tx /Ff 1 /V (Fixed)"),
            ("colours", "/FT /Ch /Opt [(Red) (Blue)]"), ("action", "/FT /Btn /Ff 65536 /MK << /CA (Press) >>"),
            ("signature", "/FT /Sig"),
        ]):
            y = 385 - i * 45
            body = f"<< /Type /Annot /Subtype /Widget /T ({name}) /Rect [72 {y} 300 {y+28}] /F 4 {attrs} >>"
            field = read_object(BytesIO(body.encode()), writer)
            field[NameObject("/P")] = writer.pages[0].indirect_reference
            ref = writer._add_object(field)
            widgets.append(ref)
            form["/Fields"].append(ref)
    elif kind == "prefilled":
        widgets[0].get_object()[NameObject("/V")] = TextStringObject("Ada Harbour")
        box = widgets[1].get_object()
        for key in ("/V", "/AS"):
            box[NameObject(key)] = NameObject("/Yes")
        form[NameObject("/NeedAppearances")] = BooleanObject(True)
    else:
        for ref in widgets:
            ref.get_object().pop("/AP", None)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def image_page(c, mixed):
    """Draw a synthetic JPEG scan and optionally a translucent PNG over it."""
    from PIL import Image, ImageDraw, ImageFont
    from reportlab.lib.utils import ImageReader

    scan = Image.new("RGB", (420, 540), "ivory")
    draw = ImageDraw.Draw(scan)
    draw.text((32, 32), "Harbour survey", font=ImageFont.truetype(str(FONTS / "inter.ttf"), 26), fill="black")
    for y in range(105, 410, 40):
        draw.line((32, y, 370, y), fill="grey", width=2)
    jpg = BytesIO()
    scan.save(jpg, "JPEG", quality=75)
    c.drawImage(ImageReader(BytesIO(jpg.getvalue())), 0, 0, 612, 792)
    if mixed:
        overlay = Image.new("RGBA", (64, 64))
        ImageDraw.Draw(overlay).ellipse((2, 2, 61, 61), fill=(30, 120, 210, 140))
        png = BytesIO()
        overlay.save(png, "PNG")
        c.drawImage(ImageReader(BytesIO(png.getvalue())), 60, 480, 120, 120, mask="auto")


def transparency():
    """Blend overlapping coloured blocks through a luminosity mask."""
    mask = stream(".35 g 0 0 90 130 re f .85 g 90 0 90 130 re f",
                  "/Type /XObject /Subtype /Form /BBox [0 0 180 130] /Resources << >> "
                  "/Group << /S /Transparency /CS /DeviceGray >>")
    return page("q 1 0 0 1 80 500 cm 1 .7 .1 rg 0 0 210 170 re f /M gs .2 .4 1 rg 20 10 160 120 re f "
                "/S gs 1 0 .3 rg 50 40 90 80 re f Q",
                "/ExtGState << /M << /BM /Multiply /SMask << /S /Luminosity /G 5 0 R >> >> /S << /BM /Screen >> >>",
                [mask])


def incremental():
    """Append two genuine cross-reference revisions that replace the visible text."""
    data = plain_text()
    for rev in (1, 2):
        prev = int(data.rsplit(b"startxref\n", 1)[1].splitlines()[0])
        start = len(data)
        data += b"4 0 obj\n" + stream(f"BT /F1 24 Tf 72 700 Td (Revision {rev}) Tj ET") + b"\nendobj\n"
        xref = len(data)
        data += (f"xref\n4 1\n{start:010d} 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R /Prev {prev} >>\n"
                 f"startxref\n{xref}\n%%EOF\n").encode()
    return data


def object_streams():
    """Pack the page dictionary in an object stream and locate it via a type-2 xref entry."""
    page_dict = b"3 0 << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 5 0 R >>"
    data = bytearray(b"%PDF-1.5\n")
    entries = [(0, 0, 65535), None, None, (2, 4, 0), None, None, None]
    for num, body in [(1, b"<< /Type /Catalog /Pages 2 0 R >>"), (2, b"<< /Type /Pages /Count 1 /Kids [3 0 R] >>"),
                      (4, stream(zlib.compress(page_dict), "/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode")),
                      (5, stream(".2 .5 .7 rg 40 500 200 120 re f"))]:
        entries[num] = (1, len(data), 0)
        data.extend(f"{num} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = len(data)
    entries[6] = (1, xref, 0)
    data += b"6 0 obj\n" + stream(b"".join(struct.pack(">BIH", *e) for e in entries),
                                   "/Type /XRef /Size 7 /Root 1 0 R /W [1 4 2]")
    return bytes(data) + f"\nendobj\nstartxref\n{xref}\n%%EOF\n".encode()


def broken_xref():
    """Shift in-use offsets while preserving every original indirect object."""
    return re.sub(rb"(\d{10}) 00000 n", lambda m: f"{int(m[1])+7:010d} 00000 n".encode(), plain_text())


def huge():
    """Insert sparse stream data before a valid xref in the OS temporary directory."""
    path = Path(tempfile.gettempdir()) / "huge-over-500mb.pdf"
    data, tail = plain_text().split(b"\nxref\n", 1)
    size = 501 * 1024 * 1024
    with path.open("wb") as f:
        f.write(data + b"\n")
        offset = f.tell()
        f.write(f"6 0 obj\n<< /Length {size} >>\nstream\n".encode())
        f.seek(size, 1)
        f.write(b"\nendstream\nendobj\n")
        xref = f.tell()
        tail = tail.replace(b"0 6\n", b"0 7\n").replace(b"trailer", f"{offset:010d} 00000 n \ntrailer".encode())
        f.write(b"xref\n" + tail.replace(b"/Size 6", b"/Size 7").split(b"startxref")[0])
        f.write(f"startxref\n{xref}\n%%EOF\n".encode())
    print(path)


def main():
    """Select builders without touching other fixtures or the founder's performance sample."""
    builders = {
        "three-pages": three_pages, "encrypted-harbour": encrypted, "annotated": annotated, "form": form_pdf,
        "text": plain_text, "latex-spaces": latex_spaces, "damaged": lambda: three_pages()[:180],
        "not-a-pdf": lambda: bytes.fromhex("89504e470d0a1a0a0000000d49484452") + bytes(64),
        "fonts-standard14": partial(canvas_pdf, standard_fonts), "fonts-truetype-subset": partial(canvas_pdf, subset_fonts),
        "fonts-cid-unicode": cid_font, "fonts-subset-edit": subset_edit,
        "fonts-type3": type3, "text-in-form-xobject": form_xobject,
        "text-rotated-and-scaled": transforms, "text-rtl-arabic": arabic,
        "text-tight-kerning": partial(text_pdf, b"BT /F1 32 Tf 48 650 Td 5 Tw [(A) 110 (V A) 85 (T tide)] TJ ET", HELV),
        "pages-mixed-sizes": partial(page_boxes, "sizes"), "pages-rotated": partial(page_boxes, "rotate"),
        "pages-cropbox": partial(page_boxes, "crop"), "pages-labels-outline": partial(canvas_pdf, partial(numbered, count=5)),
        "pages-50": partial(canvas_pdf, partial(numbered, count=50)),
        "annots-all-kinds": partial(annotations, "all"), "annots-comment-threads": partial(annotations, "threads"),
        "annots-hidden-and-locked": partial(annotations, "flags"), "form-all-fields": partial(field_fixture, "all"),
        "form-prefilled": partial(field_fixture, "prefilled"), "form-no-appearances": partial(field_fixture, "missing"),
        "scan-image-only": partial(canvas_pdf, partial(image_page, mixed=False)),
        "images-mixed": partial(canvas_pdf, partial(image_page, mixed=True)),
        "encrypted-aes256": partial(encrypted, "AES-256"), "encrypted-owner-only": partial(encrypted, "AES-128", "", 0xfffff7e8),
        "incremental-updates": incremental, "broken-xref-recoverable": broken_xref, "object-streams": object_streams,
        "transparency": transparency,
    }
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--only", type=lambda name: name.removesuffix(".pdf"), choices=builders)
    mode.add_argument("--huge", action="store_true")
    args = parser.parse_args()
    if args.huge:
        huge()
        return
    for name in ([args.only] if args.only else builders):
        if name == "text-rtl-arabic" and not ARABIC.exists():
            print(f"Skipping {name}: local Playpen Sans Arabic font missing")
            continue
        data = builders[name]()
        if len(data) >= 200_000:
            raise ValueError(f"{name} exceeds its size budget")
        (HERE / f"{name}.pdf").write_bytes(data)


if __name__ == "__main__":
    main()
