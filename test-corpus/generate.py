"""Builds the small Phase 1 fixtures. Run: python3 test-corpus/generate.py (needs pypdf)."""
from pathlib import Path
from pypdf import PdfReader, PdfWriter

HERE = Path(__file__).parent


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
    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


basic = build_pdf([(612, 792, 0, (0.1, 0.3, 0.5)), (595, 842, 0, (0.8, 0.6, 0.2)), (612, 792, 90, (0.2, 0.6, 0.4))])
(HERE / "three-pages.pdf").write_bytes(basic)

writer = PdfWriter(clone_from=PdfReader(HERE / "three-pages.pdf"))
writer.encrypt(user_password="harbour", owner_password="harbour-owner", algorithm="RC4-128")
with open(HERE / "encrypted-harbour.pdf", "wb") as f:
    writer.write(f)

# Annotations made by another app: a red square with no name, and a named stamp.
annotated = build_pdf(
    [(612, 792, 0, (0.9, 0.9, 0.9))],
    annots=[
        "<< /Type /Annot /Subtype /Square /Rect [100 600 200 700] /C [1 0 0] /Border [0 0 4] >>",
        "<< /Type /Annot /Subtype /Stamp /Rect [300 600 450 650] /Name /Approved /NM (stamp-from-elsewhere) >>",
    ],
)
(HERE / "annotated.pdf").write_bytes(annotated)

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
    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


# Real text in Helvetica: two lines, for text selection and highlights.
(HERE / "text.pdf").write_bytes(
    text_pdf(
        b"BT /F1 24 Tf 72 700 Td (Tide tables for the headland) Tj 0 -30 Td (Check before you walk) Tj ET",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    )
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
(HERE / "latex-spaces.pdf").write_bytes(
    text_pdf(
        b"BT /F1 24 Tf 72 700 Td [(Dean) -280 (List) -280 (7) -280 (times) -280 (recipient)] TJ ET",
        f"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [{zero_space_widths}] >>",
    )
)

(HERE / "damaged.pdf").write_bytes(basic[:180])
(HERE / "not-a-pdf.pdf").write_bytes(bytes.fromhex("89504e470d0a1a0a0000000d49484452") + b"\x00" * 64)
print("ok")
