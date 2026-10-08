"""Rasterize everyday and difficult fixtures and verify content and page bounds.

Uses pdfplumber and Poppler, falling back to pypdfium2 if needed.
No browser state or license data is read.
"""
import json
import shutil
import subprocess
from tempfile import TemporaryDirectory
from pathlib import Path
import pdfplumber
from pypdf import PdfReader
from PIL import Image

output = Path(__file__).resolve().parents[1] / "output" / "pdf"
report = {}
for name in ("change-brief", "invoice", "long-brief", "invoice-logo", "explicit-credit"):
    path = output / f"{name}.pdf"
    for previous in output.glob(f"{name}-p*.png"):
        previous.unlink()
    poppler = shutil.which("pdftoppm")
    document = None
    if poppler:
        with TemporaryDirectory(prefix="scopeledger-pdf-raster-") as temporary:
            prefix = str(Path(temporary) / "page")
            subprocess.run([poppler, "-r", "108", "-png", str(path), prefix], check=True, capture_output=True)
            for page in Path(temporary).glob("page-*.png"):
                number = int(page.stem.split("-")[-1])
                shutil.move(page, output / f"{name}-p{number:02}.png")
    else:
        import pypdfium2 as pdfium
        document = pdfium.PdfDocument(str(path))
    with pdfplumber.open(path) as pdf:
        reader = PdfReader(path)
        page_text = [" ".join((page.extract_text() or "").split()) for page in reader.pages]
        all_text = "\n".join(page_text)
        off_page = []
        for number, page in enumerate(pdf.pages, 1):
            for word in page.extract_words():
                if word["x0"] < -0.5 or word["top"] < -0.5 or word["x1"] > page.width + 0.5 or word["bottom"] > page.height + 0.5:
                    off_page.append({"page": number, "text": word["text"]})
            if document:
                raster = document[number - 1].render(scale=1.5)
                raster.to_pil().save(output / f"{name}-p{number:02}.png")
        assert not off_page, f"{name}: content outside page: {off_page}"
        assert "PRIVATE HOURS" not in all_text and "loaded cost" not in all_text.lower() and "margin target" not in all_text.lower(), f"{name}: private data"
        # These structural checks establish actual tags/bookmarks, not reader
        # accessibility, reading order or PDF/UA compliance.
        reader = PdfReader(path)
        root = reader.trailer["/Root"]
        assert root.get("/StructTreeRoot"), f"{name}: missing structure tree"
        assert root.get("/MarkInfo", {}).get("/Marked"), f"{name}: unmarked PDF"
        assert str(root.get("/Lang", "")).startswith("en"), f"{name}: missing document language"
        assert reader.outline, f"{name}: missing heading outline"
        assert 'Sign-off' in all_text and 'Studio signatory (sample)' in all_text, f"{name}: missing signature details"
        images = [image for page in reader.pages for image in page.images]
        assert any(image.image.size == (640, 160) for image in images), f"{name}: missing embedded imported signature"
        if name in ("change-brief", "invoice"):
            assert len(pdf.pages) == 1, f"{name}: the ordinary sample should fit on one page."
            assert "Sample document for design review. No payment is requested." in all_text
            assert "d1513e04-9cb2-455b-a080-2515a9d9852e" not in all_text, "Internal source IDs must stay out of client copy."
            assert "ScopeLedger - sample issuer" in all_text and "scopeledger.site" in all_text
            assert "Aster Studio" not in all_text, "Public demonstrations should use ScopeLedger's identity."
            with Image.open(output / "scopeledger-demo-logo.png") as demonstration_logo:
                assert any(image.image.size == demonstration_logo.size for image in images), f"{name}: missing ScopeLedger header logo"
        if name == "change-brief":
            assert "USD 800.00" in all_text and "proposed additional fee" in all_text.casefold()
            for heading in ("Scope of request", "Deliverables", "Exclusions", "Dependencies", "Assumptions", "Delivery implications", "Approval requirements"):
                assert heading in all_text, f"Brief section missing: {heading}"
        if name == "invoice":
            for value in ("INV-2026-001", "USD 800.00", "USD 40.00", "USD 840.00", "2026-10-15", "Recorded approval", "Payment instructions"):
                assert value in all_text, f"Invoice content missing: {value}"
        if name == "explicit-credit":
            assert len(pdf.pages) == 1, "Short credit must fit on one page."
            assert "USD 105.00" in all_text and "not a request for payment" in all_text
            assert "do not send another payment" in all_text
        if name == "invoice-logo":
            words = [word["text"] for page in pdf.pages for word in page.extract_words()]
            assert "945,000,000,000,000,000,000,000.00" in words, "Large total must remain unbroken."
            assert "5.00%" in all_text
            assert len(pdf.pages) == 2, "The long stress invoice should use two readable pages."
            paragraph = "The journal collection uses the approved design system. Client content must arrive before the agreed build milestone. Review covers the named templates, including responsive layouts and agreed acceptance criteria. New integrations, copywriting, bulk entry and an additional visual direction require separate review."
            for number in range(1, 6):
                block = f"Approved deliverable {number}: {paragraph}"
                assert any(block in text for text in page_text), f"Short invoice paragraph {number} is split across pages."
        if name == "long-brief":
            assert len(pdf.pages) >= 3 and "Proposed scope removal" in all_text
            assert "proposed credit" in all_text.casefold() and "USD -100.00" in all_text
            assert "Removed archive work exceeds" in all_text
        report[name] = {"pages": len(pdf.pages), "offPageWords": len(off_page), "privateFieldLeak": False, "textCharacters": len(all_text), "tagged": True, "documentLanguage": str(root.get("/Lang")), "outline": True, "signatureEmbedded": True}
    if document:
        document.close()
(output / "QA-REPORT.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
