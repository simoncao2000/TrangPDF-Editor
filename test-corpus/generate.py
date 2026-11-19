"""Builds the small Phase 1 fixtures. Run: python3 test-corpus/generate.py (needs pypdf)."""
from pathlib import Path
from pypdf import PdfReader, PdfWriter

HERE = Path(__file__).parent


def build_pdf(pages):
    """Writes a minimal valid PDF. pages: list of (width_pt, height_pt, rotate, rgb) tuples."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None]
    kids = []
    for w, h, rot, (r, g, b) in pages:
        content = f"{r} {g} {b} rg 36 36 {w - 72} {h / 2} re f".encode()
        objs.append(f"<< /Length {len(content)} >>\nstream\n{content.decode()}\nendstream")
        cid = len(objs)
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] /Rotate {rot} /Contents {cid} 0 R >>")
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

(HERE / "damaged.pdf").write_bytes(basic[:180])
(HERE / "not-a-pdf.pdf").write_bytes(bytes.fromhex("89504e470d0a1a0a0000000d49484452") + b"\x00" * 64)
print("ok")
