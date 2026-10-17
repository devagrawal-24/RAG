"""
tests/test_fitz_ieee.py
-----------------------
Smoke test: Build a minimal two-column IEEE-layout PDF with PyMuPDF (fitz)
using insert_htmlbox for the title banner and both columns.

Run from the project root:
    python -m pytest tests/test_fitz_ieee.py -v
or directly:
    python tests/test_fitz_ieee.py
"""
import os
import sys

import pytest

# ---------------------------------------------------------------------------
# Ensure project root is on sys.path so backend imports work
# ---------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


# ---------------------------------------------------------------------------
# Skip the whole module if PyMuPDF is not installed
# ---------------------------------------------------------------------------
fitz = pytest.importorskip("fitz", reason="PyMuPDF (fitz) is not installed.")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_ieee_page():
    """Create an in-memory single-page IEEE-style document and return it."""
    doc = fitz.open()
    doc.insert_page(0, width=595.3, height=841.9)
    page = doc[0]

    # Title banner across full width ----------------------------------------
    title_html = """
<div style="text-align: center; font-family: 'Times New Roman', serif;">
  <h1 style="font-size: 14pt; margin: 0 0 6pt 0; font-weight: bold; line-height: 1.2;">
    A Systematic Review and Taxonomy of Digital and Emerging Domain Forensics:
    Methodological Foundations and Open Challenges
  </h1>
  <p style="font-size: 9pt; margin: 0 0 2pt 0; font-weight: 500;">Academic Research Group</p>
  <p style="font-size: 8pt; margin: 0 0 8pt 0; color: #444;">
    <i>Department of Computer Science and Digital Forensics, Research Division</i>
    <br/>Email: research@domain.edu
  </p>
</div>
"""
    page.insert_htmlbox(fitz.Rect(40, 36, 555, 140), title_html)

    # Column 1 ----------------------------------------------------------------
    col1_html = """
<div style="font-family: 'Times New Roman', serif; font-size: 8.5pt;
            line-height: 1.25; text-align: justify;">
  <p style="margin: 0 0 8pt 0;">
    <b><i>Abstract</i>&mdash;As digital infrastructures evolve into complex cloud-native,
    virtual reality, and decentralised blockchain environments, traditional
    artifact-based digital forensics faces unprecedented scalability,
    structural, and procedural bottlenecks.  This paper presents a
    comprehensive survey of modern forensics frameworks.</b>
  </p>
  <p style="margin: 0 0 8pt 0;">
    <b><i>Keywords</i>&mdash;Digital Forensics, Cloud Forensics, Network Forensics,
    Blockchain Analysis, Survey.</b>
  </p>
  <h2 style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase;
             margin: 10pt 0 4pt 0; text-align: center;">
    I. Introduction &amp; Background Foundations
  </h2>
  <p style="margin: 0 0 6pt 0; text-indent: 14pt;">
    Digital forensics has traditionally relied on physical acquisition and
    static disk imaging.  However, the paradigm shift toward highly dynamic,
    decentralised, and virtual ecosystems has rendered static paradigms
    insufficient.
  </p>
</div>
"""
    page.insert_htmlbox(fitz.Rect(40, 145, 290, 800), col1_html)

    # Column 2 ----------------------------------------------------------------
    col2_html = """
<div style="font-family: 'Times New Roman', serif; font-size: 8.5pt;
            line-height: 1.25; text-align: justify;">
  <h2 style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase;
             margin: 0 0 4pt 0; text-align: center;">
    II. Taxonomy &amp; Categorisation
  </h2>
  <p style="margin: 0 0 6pt 0; text-indent: 14pt;">
    To systematically analyse existing literature, we propose a multi-tier
    operational taxonomy that categorises forensic frameworks based on their
    target architecture, acquisition layer, and analytical processing
    methodology.
  </p>
</div>
"""
    page.insert_htmlbox(fitz.Rect(305, 145, 555, 800), col2_html)

    return doc


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFitzIeeeLayout:
    """Verify that PyMuPDF can render a minimal two-column IEEE-style page."""

    def test_document_has_one_page(self):
        doc = _build_ieee_page()
        assert len(doc) == 1, "Expected exactly one page."

    def test_page_dimensions_a4(self):
        doc = _build_ieee_page()
        page = doc[0]
        rect = page.rect
        # A4: 595.3 x 841.9 pt (within a 1-pt tolerance)
        assert abs(rect.width - 595.3) < 1.0, f"Unexpected page width: {rect.width}"
        assert abs(rect.height - 841.9) < 1.0, f"Unexpected page height: {rect.height}"

    def test_save_to_bytes(self):
        """Document must be writable to in-memory bytes (no disk required)."""
        doc = _build_ieee_page()
        pdf_bytes = doc.tobytes()
        assert len(pdf_bytes) > 1024, "PDF output seems too small."
        # PDF magic bytes
        assert pdf_bytes[:4] == b"%PDF", "Output is not a valid PDF."

    def test_pixmap_renders(self):
        """Page must render to a pixmap at 96 dpi without raising."""
        doc = _build_ieee_page()
        page = doc[0]
        pix = page.get_pixmap(dpi=96)
        assert pix.width > 200, "Pixmap width unexpectedly small."
        assert pix.height > 200, "Pixmap height unexpectedly small."


# ---------------------------------------------------------------------------
# Allow running as a plain script for quick visual inspection
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    out_pdf = os.path.join(ROOT, "test_ieee.pdf")
    out_png = os.path.join(ROOT, "test_ieee.png")

    doc = _build_ieee_page()
    doc.save(out_pdf)

    page = doc[0]
    pix = page.get_pixmap(dpi=150)
    pix.save(out_png)

    print(
        f"SUCCESS! Wrote {out_pdf} and {out_png}  "
        f"({pix.width}x{pix.height} px)"
    )
