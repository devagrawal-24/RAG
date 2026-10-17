"""
tests/test_title_2col.py
------------------------
Tests PyMuPDF's fitz.Story-based multi-page two-column layout with a
full-width title banner overlaid on page 0 using insert_htmlbox.

Run from the project root:
    python -m pytest tests/test_title_2col.py -v
or directly:
    python tests/test_title_2col.py
"""
import io
import os
import sys

import pytest

# ---------------------------------------------------------------------------
# Ensure project root is on sys.path
# ---------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# ---------------------------------------------------------------------------
# Skip the whole module if PyMuPDF is not installed
# ---------------------------------------------------------------------------
fitz = pytest.importorskip("fitz", reason="PyMuPDF (fitz) is not installed.")


# ---------------------------------------------------------------------------
# Layout constants (mirroring compile_service / latex_compiler conventions)
# ---------------------------------------------------------------------------

PAGE_W, PAGE_H = 595.3, 841.9

TITLE_RECT   = fitz.Rect(40,  36,  555, 140)
COL1_P0_RECT = fitz.Rect(40,  150, 290, 800)   # page-0 col 1 (below title)
COL2_P0_RECT = fitz.Rect(305, 150, 555, 800)   # page-0 col 2
COL1_NORM    = fitz.Rect(40,  40,  290, 800)   # subsequent pages col 1
COL2_NORM    = fitz.Rect(305, 40,  555, 800)   # subsequent pages col 2

TITLE_HTML = (
    '<div style="text-align:center;font-family:serif;">'
    '<h1 style="font-size:16pt;margin:0;">A Systematic Review and Taxonomy</h1>'
    '<p style="font-size:9pt;margin:4px 0;">Academic Research Group</p>'
    "</div>"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rectfn(n: int, filled):
    """
    Rect-provider for fitz.Story.write().

    Page 0  : full A4 mediabox, title column and second column
              positioned below the title banner.
    Page 1  : continuation on the same virtual page-0 second column
              (no new mediabox → appended to existing page).
    Page 2+ : alternating A4 pages with two full-height columns.
    """
    if n == 0:
        return (fitz.Rect(0, 0, PAGE_W, PAGE_H), COL1_P0_RECT, None)
    if n == 1:
        return (None, COL2_P0_RECT, None)
    idx = n - 2
    mb = fitz.Rect(0, 0, PAGE_W, PAGE_H) if (idx % 2 == 0) else None
    col = COL1_NORM if (idx % 2 == 0) else COL2_NORM
    return (mb, col, None)


def _build_two_col_doc(word_count: int = 2000):
    """
    Build a multi-page two-column story document with a title banner on page 0.
    Returns the final fitz.Document in-memory (no disk I/O).
    """
    story = fitz.Story(html="<p>" + "word " * word_count + "</p>")

    # Write story into an in-memory PDF via DocumentWriter + BytesIO
    buf = io.BytesIO()
    writer = fitz.DocumentWriter(buf)
    story.write(writer, _rectfn)
    writer.close()

    # Re-open for editing so we can overlay the title banner
    buf.seek(0)
    doc = fitz.open(stream=buf.read(), filetype="pdf")

    # Overlay title banner on page 0
    doc[0].insert_htmlbox(TITLE_RECT, TITLE_HTML)

    return doc


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTitleTwoColumn:
    """Story-based two-column layout with a title banner."""

    def test_at_least_one_page(self):
        doc = _build_two_col_doc()
        assert len(doc) >= 1, "Document should have at least one page."

    def test_page0_dimensions(self):
        doc = _build_two_col_doc()
        rect = doc[0].rect
        assert abs(rect.width  - PAGE_W) < 1.0, f"Width mismatch: {rect.width}"
        assert abs(rect.height - PAGE_H) < 1.0, f"Height mismatch: {rect.height}"

    def test_multipage_for_large_content(self):
        """2 000 repeated words should spill onto more than one page."""
        doc = _build_two_col_doc(word_count=2000)
        assert len(doc) > 1, (
            f"Expected multiple pages for 2000 words; got {len(doc)}."
        )

    def test_pdf_bytes_valid(self):
        """Saving to bytes must yield a valid PDF stream."""
        doc = _build_two_col_doc(word_count=500)
        pdf_bytes = doc.tobytes()
        assert pdf_bytes[:4] == b"%PDF", "Output is not a valid PDF."
        assert len(pdf_bytes) > 1024, "PDF output seems unreasonably small."

    def test_page0_pixmap(self):
        """Page 0 should render to a non-trivial pixmap."""
        doc = _build_two_col_doc(word_count=500)
        pix = doc[0].get_pixmap(dpi=96)
        assert pix.width  > 200, "Pixmap width too small."
        assert pix.height > 200, "Pixmap height too small."


# ---------------------------------------------------------------------------
# Allow running as a plain script for quick visual inspection
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    out_pdf      = os.path.join(ROOT, "test_title_2col_final.pdf")
    out_page_png = os.path.join(ROOT, "test_title_2col_page0.png")

    doc = _build_two_col_doc(word_count=2000)
    doc.save(out_pdf)

    pix = doc[0].get_pixmap(dpi=150)
    pix.save(out_page_png)

    print(
        f"SUCCESS! Rendered page 0 with title banner + 2-column flow!\n"
        f"  PDF  : {out_pdf}  ({len(doc)} pages)\n"
        f"  Image: {out_page_png}  ({pix.width}x{pix.height} px)"
    )
