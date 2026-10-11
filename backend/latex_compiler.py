# latex_compiler.py -- In-process LaTeX to HTML & PDF renderer for the Draft Studio IDE.
#
# Converts a LaTeX source document to:
#   1. A rendered HTML preview with clean academic typography
#   2. High-fidelity PDF pages rendered as high-res images / PDF bytes via PyMuPDF
#
# Supported constructs:
#   - Document preamble stripping (\documentclass, \usepackage, \def, macros)
#   - IEEE author / affiliation blocks (\IEEEauthorblockN, \IEEEauthorblockA, etc.)
#   - Environments: abstract, IEEEkeywords, itemize, enumerate, description, figure, table, table*, tabular, tabularx
#   - Section commands: \section, \subsection, \subsubsection, \paragraph
#   - Inline markup: \textbf, \textit, \emph, \texttt, \underline, \textsc
#   - Math: inline ($...$, \(...\)) and display ($$...$$, \[...\], equation)
#   - References: \cite{key}, \label{key}, \ref{key}
#   - Booktabs: \toprule, \midrule, \bottomrule

import re
import base64
from typing import Tuple, List, Dict, Any, Optional

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _esc(text: str) -> str:
    """HTML-escape a plain-text string (not used on math/code spans)."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))


def extract_braced_content(text: str, start_pos: int) -> Tuple[Optional[str], int]:
    """Extract content inside balanced curly braces starting after start_pos."""
    depth = 0
    start = -1
    for i in range(start_pos, len(text)):
        if text[i] == '{':
            if depth == 0:
                start = i + 1
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return text[start:i], i + 1
    return None, -1


# ---------------------------------------------------------------------------
# Pre-processing
# ---------------------------------------------------------------------------

def _strip_comments(src: str) -> str:
    """Remove LaTeX line comments (% …)."""
    return re.sub(r"(?<!\\)%[^\n]*", "", src)


def _extract_preamble_body(src: str) -> Tuple[Dict[str, Any], str]:
    """
    Separates the preamble from the document body.
    Returns (preamble_meta, body_text).
    """
    meta: Dict[str, Any] = {
        "title": "",
        "author": "",
        "date": "",
        "document_class": "article",
        "packages": [],
        "warnings": [],
    }

    # Extract title, author, date using balanced braces
    for key in ("title", "author", "date"):
        pattern = rf"\\{key}\s*\{{"
        m = re.search(pattern, src)
        if m:
            content, _ = extract_braced_content(src, m.start())
            if content:
                meta[key] = content.strip()

    # Extract documentclass
    m = re.search(r"\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}", src)
    if m:
        meta["document_class"] = m.group(1).strip()

    # Collect usepackage names
    for m in re.finditer(r"\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}", src):
        meta["packages"].extend([p.strip() for p in m.group(1).split(",")])

    # Extract body between \begin{document} … \end{document}
    body_m = re.search(r"\\begin\{document\}(.*?)\\end\{document\}", src, re.DOTALL)
    body = body_m.group(1) if body_m else src

    return meta, body


# ---------------------------------------------------------------------------
# Math placeholder system (protect math from HTML conversion)
# ---------------------------------------------------------------------------

_MATH_PLACEHOLDERS: Dict[str, str] = {}
_MATH_COUNTER = [0]


def _save_math(math_src: str, display: bool) -> str:
    """Stash math content and return a unique placeholder token."""
    key = f"\x00MATH{_MATH_COUNTER[0]}\x00"
    _MATH_COUNTER[0] += 1
    if display:
        _MATH_PLACEHOLDERS[key] = f'<span class="math-display">\\[{math_src}\\]</span>'
    else:
        _MATH_PLACEHOLDERS[key] = f'<span class="math-inline">\\({math_src}\\)</span>'
    return key


def _protect_math(src: str) -> str:
    """Replace all math spans with placeholders before HTML processing."""
    # Display math: $$…$$
    src = re.sub(r"\$\$(.*?)\$\$", lambda m: _save_math(m.group(1), True), src, flags=re.DOTALL)
    # Inline math: $…$
    src = re.sub(r"(?<!\$)\$(?!\$)(.*?)(?<!\$)\$(?!\$)", lambda m: _save_math(m.group(1), False), src, flags=re.DOTALL)
    # Display math: \[ … \]
    src = re.sub(r"\\\[(.*?)\\\]", lambda m: _save_math(m.group(1), True), src, flags=re.DOTALL)
    # Inline math: \( … \)
    src = re.sub(r"\\\((.*?)\\\)", lambda m: _save_math(m.group(1), False), src, flags=re.DOTALL)
    return src


def _restore_math(html: str) -> str:
    for key, val in _MATH_PLACEHOLDERS.items():
        html = html.replace(key, val)
    _MATH_PLACEHOLDERS.clear()
    _MATH_COUNTER[0] = 0
    return html


# ---------------------------------------------------------------------------
# Verbatim / lstlisting placeholder
# ---------------------------------------------------------------------------

_VERB_PLACEHOLDERS: Dict[str, str] = {}
_VERB_COUNTER = [0]


def _protect_verbatim(src: str) -> str:
    def _stash(m):
        key = f"\x00VERB{_VERB_COUNTER[0]}\x00"
        _VERB_COUNTER[0] += 1
        content = _esc(m.group(1))
        _VERB_PLACEHOLDERS[key] = f'<pre class="latex-verbatim"><code>{content}</code></pre>'
        return key

    src = re.sub(r"\\begin\{(?:verbatim|lstlisting)\}(.*?)\\end\{(?:verbatim|lstlisting)\}", _stash, src, flags=re.DOTALL)
    # Inline \verb|...|
    src = re.sub(r"\\verb\|([^|]+)\|", lambda m: f'<code class="latex-inline-verb">{_esc(m.group(1))}</code>', src)
    return src


def _restore_verbatim(html: str) -> str:
    for key, val in _VERB_PLACEHOLDERS.items():
        html = html.replace(key, val)
    _VERB_PLACEHOLDERS.clear()
    _VERB_COUNTER[0] = 0
    return html


# ---------------------------------------------------------------------------
# Environment converters
# ---------------------------------------------------------------------------

def _convert_abstract(body: str) -> str:
    def _replace(m):
        content = _process_inline(m.group(1).strip())
        return f'<div class="latex-abstract"><h4>Abstract</h4><p>{content}</p></div>'
    return re.sub(r"\\begin\{abstract\}(.*?)\\end\{abstract\}", _replace, body, flags=re.DOTALL)


def _convert_keywords(body: str) -> str:
    def _replace(m):
        content = _process_inline(m.group(1).strip())
        return f'<div class="latex-keywords"><strong>Index Terms—</strong><span>{content}</span></div>'
    return re.sub(r"\\begin\{(?:IEEEkeywords|keywords)\}(.*?)\\end\{(?:IEEEkeywords|keywords)\}", _replace, body, flags=re.DOTALL)


def _convert_itemize(body: str) -> str:
    def _replace(m):
        items_raw = re.split(r"\\item\s*", m.group(1))
        items_html = "".join(f"<li>{_process_inline(i.strip())}</li>" for i in items_raw if i.strip())
        return f"<ul>{items_html}</ul>"
    return re.sub(r"\\begin\{itemize\}(.*?)\\end\{itemize\}", _replace, body, flags=re.DOTALL)


def _convert_enumerate(body: str) -> str:
    def _replace(m):
        items_raw = re.split(r"\\item\s*", m.group(1))
        items_html = "".join(f"<li>{_process_inline(i.strip())}</li>" for i in items_raw if i.strip())
        return f"<ol>{items_html}</ol>"
    return re.sub(r"\\begin\{enumerate\}(.*?)\\end\{enumerate\}", _replace, body, flags=re.DOTALL)


def _convert_description(body: str) -> str:
    def _replace(m):
        items_raw = m.group(1)
        entries = re.findall(r"\\item\[([^\]]*)\]\s*(.*?)(?=\\item|\Z)", items_raw, re.DOTALL)
        rows = "".join(f"<dt>{_esc(label.strip())}</dt><dd>{_process_inline(content.strip())}</dd>" for label, content in entries)
        return f"<dl>{rows}</dl>"
    return re.sub(r"\\begin\{description\}(.*?)\\end\{description\}", _replace, body, flags=re.DOTALL)


def _convert_tabular(body: str) -> str:
    """Converts tabular and tabularx environments to well-formed HTML tables."""
    def _replace(m):
        content = m.group(2)

        # Clean table rules
        content = re.sub(r"\\(?:toprule|midrule|bottomrule|hline)\b", "", content)

        rows_raw = re.split(r"\\\\", content)
        rows_html = ""
        is_first_row = True
        for row in rows_raw:
            row = row.strip()
            if not row:
                continue
            cells = row.split("&")
            cell_tag = "th" if is_first_row else "td"
            cells_html = "".join(f"<{cell_tag}>{_process_inline(c.strip())}</{cell_tag}>" for c in cells)
            rows_html += f"<tr>{cells_html}</tr>\n"
            is_first_row = False
        return f'<table class="latex-table"><tbody>\n{rows_html}</tbody></table>'

    # Match tabular and tabularx (which has width argument first)
    pattern = r"\\begin\{(?:tabular|tabularx)\}(?:\{[^{}]*\})*\{([^{}]*)\}(.*?)\\end\{(?:tabular|tabularx)\}"
    return re.sub(pattern, _replace, body, flags=re.DOTALL)


def _convert_table_float(body: str) -> str:
    """Convert table and table* float environments."""
    def _replace(m):
        inner = m.group(1)
        caption_m = re.search(r"\\caption\{([^}]+)\}", inner)
        caption = caption_m.group(1) if caption_m else ""
        inner = re.sub(r"\\caption\{[^}]+\}", "", inner)
        inner = re.sub(r"\\label\{[^}]+\}", "", inner)
        inner = re.sub(r"\\centering\b", "", inner)
        inner = re.sub(r"\\small\b", "", inner)
        inner = re.sub(r"\\footnotesize\b", "", inner)
        processed = _convert_tabular(inner.strip())
        cap_html = f'<figcaption class="latex-caption">{_process_inline(caption)}</figcaption>' if caption else ""
        return f'<figure class="latex-table-float">{cap_html}{processed}</figure>'
    return re.sub(r"\\begin\{table\*?\}(?:\[[^\]]*\])?(.*?)\\end\{table\*?\}", _replace, body, flags=re.DOTALL)


def _convert_figure(body: str) -> str:
    def _replace(m):
        inner = m.group(1)
        caption_m = re.search(r"\\caption\{([^}]+)\}", inner)
        caption = caption_m.group(1) if caption_m else "Figure"
        return (
            f'<figure class="latex-figure">'
            f'<div class="latex-figure-placeholder">'
            f'<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">'
            f'<rect x="3" y="3" width="18" height="18" rx="2"/>'
            f'<circle cx="8.5" cy="8.5" r="1.5"/>'
            f'<polyline points="21 15 16 10 5 21"/>'
            f'</svg>'
            f'<span>[Figure: {_esc(caption)}]</span>'
            f'</div>'
            f'<figcaption class="latex-caption">{_esc(caption)}</figcaption>'
            f'</figure>'
        )
    return re.sub(r"\\begin\{figure\*?\}(?:\[[^\]]*\])?(.*?)\\end\{figure\*?\}", _replace, body, flags=re.DOTALL)


def _convert_quote(body: str) -> str:
    def _replace(m):
        return f'<blockquote class="latex-quote">{_process_inline(m.group(1).strip())}</blockquote>'
    return re.sub(r"\\begin\{quote\}(.*?)\\end\{quote\}", _replace, body, flags=re.DOTALL)


def _convert_equation_env(body: str) -> str:
    """Convert equation/align environments (math already protected by _protect_math)."""
    def _replace_eq(m):
        inner = m.group(2).strip()
        return f'<div class="math-display">\\[{inner}\\]</div>'
    body = re.sub(r"\\begin\{(equation|align|equation\*|align\*|eqnarray)\}(.*?)\\end\{\1\}", _replace_eq, body, flags=re.DOTALL)
    return body


# ---------------------------------------------------------------------------
# Section commands
# ---------------------------------------------------------------------------

def _convert_sections(body: str) -> str:
    body = re.sub(r"\\chapter\*?\{([^}]+)\}", lambda m: f"<h1 class='latex-chapter'>{_process_inline(m.group(1))}</h1>", body)
    body = re.sub(r"\\section\*?\{([^}]+)\}", lambda m: f"<h2 class='latex-section'>{_process_inline(m.group(1))}</h2>", body)
    body = re.sub(r"\\subsection\*?\{([^}]+)\}", lambda m: f"<h3 class='latex-subsection'>{_process_inline(m.group(1))}</h3>", body)
    body = re.sub(r"\\subsubsection\*?\{([^}]+)\}", lambda m: f"<h4 class='latex-subsubsection'>{_process_inline(m.group(1))}</h4>", body)
    body = re.sub(r"\\paragraph\*?\{([^}]+)\}", lambda m: f"<p><strong>{_process_inline(m.group(1))}</strong></p>", body)
    return body


# ---------------------------------------------------------------------------
# Inline command conversions
# ---------------------------------------------------------------------------

def _process_inline(text: str) -> str:
    """Convert LaTeX inline commands to clean HTML."""
    # IEEE author blocks
    text = re.sub(r"\\IEEEauthorblockN\{([^}]*)\}", r"<strong class='author-name'>\1</strong>", text)
    text = re.sub(r"\\IEEEauthorblockA\{([^}]*)\}", r"<span class='author-affil'>\1</span>", text)

    # Bold, italic, emphasis, monospace, underline, superscript, subscript
    text = re.sub(r"\\textbf\{([^}]*)\}", r"<strong>\1</strong>", text)
    text = re.sub(r"\\textit\{([^}]*)\}", r"<em>\1</em>", text)
    text = re.sub(r"\\emph\{([^}]*)\}", r"<em>\1</em>", text)
    text = re.sub(r"\\texttt\{([^}]*)\}", r"<code>\1</code>", text)
    text = re.sub(r"\\underline\{([^}]*)\}", r"<u>\1</u>", text)
    text = re.sub(r"\\textsuperscript\{([^}]*)\}", r"<sup>\1</sup>", text)
    text = re.sub(r"\\textsubscript\{([^}]*)\}", r"<sub>\1</sub>", text)
    text = re.sub(r"\\textsc\{([^}]*)\}", r"<span style='font-variant:small-caps'>\1</span>", text)

    # Citations and references
    text = re.sub(r"\\cite(?:p|t|author|year)?\{([^}]+)\}",
                  lambda m: f'<span class="latex-cite">[{_esc(m.group(1))}]</span>', text)
    text = re.sub(r"\\ref\{([^}]+)\}",
                  lambda m: f'<span class="latex-ref">[{_esc(m.group(1))}]</span>', text)
    text = re.sub(r"\\label\{([^}]+)\}", "", text)
    text = re.sub(r"\\footnote\{([^}]+)\}",
                  lambda m: f'<span class="latex-footnote" title="{_esc(m.group(1))}">†</span>', text)

    # Typographical quotes and dashes
    text = text.replace("---", "—").replace("--", "–")
    text = text.replace("``", "“").replace("''", "”")
    text = text.replace("`", "‘").replace("'", "’")
    text = text.replace("~", "&nbsp;")

    # Escaped symbols
    text = text.replace(r"\%", "%").replace(r"\$", "$").replace(r"\&", "&amp;")
    text = text.replace(r"\#", "#").replace(r"\{", "{").replace(r"\}", "}")
    text = text.replace(r"\~{}", "~").replace(r"\^{}", "^")
    text = text.replace(r"\textasciitilde{}", "~")
    text = text.replace(r"\ldots", "…").replace(r"\dots", "…")

    # Line breaks
    text = re.sub(r"\\\\(\[\d+(?:pt|mm|cm|em)\])?", "<br/>", text)
    text = re.sub(r"\\newline\b", "<br/>", text)
    text = re.sub(r"\\noindent\b", "", text)

    # Spacing and layout commands
    text = re.sub(r"\\(?:vspace|hspace)\*?\{[^}]*\}", "", text)
    text = re.sub(r"\\(?:bigskip|medskip|smallskip|quad|qquad)\b", "&nbsp;", text)

    # Strip custom macros like \BibTeX
    text = re.sub(r"\\def\\BibTeX\{[^}]*\}", "", text)
    text = re.sub(r"\\BibTeX\b", "BibTeX", text)

    # Strip unknown remaining backslash commands that have no argument
    text = re.sub(r"\\[a-zA-Z]+\*?\b", "", text)
    # Strip stray curly braces
    text = re.sub(r"\{|\}", "", text)

    return text


# ---------------------------------------------------------------------------
# Paragraph conversion
# ---------------------------------------------------------------------------

def _convert_paragraphs(body: str) -> str:
    """Wrap plain text blocks in <p> tags, preserving existing block HTML tags."""
    lines = body.split("\n")
    out_lines: List[str] = []
    block_tags = ("<div", "<table", "<figure", "<h1", "<h2", "<h3", "<h4", "<ul", "<ol", "<dl", "<header", "<blockquote", "<pre", "<section")

    for line in lines:
        stripped = line.strip()
        if not stripped:
            out_lines.append("")
        elif any(stripped.startswith(tag) for tag in block_tags) or stripped.startswith("</") or stripped.startswith("<tr") or stripped.startswith("<td") or stripped.startswith("<th") or stripped.startswith("<li"):
            out_lines.append(stripped)
        else:
            out_lines.append(f"<p>{stripped}</p>")

    return "\n".join(out_lines)


# ---------------------------------------------------------------------------
# \maketitle generator
# ---------------------------------------------------------------------------

def _convert_maketitle(body: str, meta: Dict[str, Any]) -> str:
    title = meta.get("title", "")
    author = meta.get("author", "")
    date = meta.get("date", "")

    title_html = ""
    if title or author:
        title_html = (
            f'<header class="latex-doc-header">'
            f'{"<h1 class=latex-doc-title>" + _process_inline(title) + "</h1>" if title else ""}'
            f'{"<div class=latex-doc-author>" + _process_inline(author) + "</div>" if author else ""}'
            f'{"<p class=latex-doc-date>" + _esc(date) + "</p>" if date else ""}'
            f'</header>'
        )
    return re.sub(r"\\maketitle\b", lambda _: title_html, body)


# ---------------------------------------------------------------------------
# Bibliography / references section
# ---------------------------------------------------------------------------

def _convert_bibliography(body: str) -> str:
    def _replace(m):
        inner = m.group(1)
        entries = re.findall(r"\\bibitem\{([^}]+)\}(.*?)(?=\\bibitem|\Z)", inner, re.DOTALL)
        if not entries:
            return "<section class='latex-bibliography'><h2>References</h2><p>(Bibliography not parseable)</p></section>"
        items = "".join(f"<li id='bib-{_esc(key)}'>{_process_inline(text.strip())}</li>" for key, text in entries)
        return f"<section class='latex-bibliography'><h2>References</h2><ol>{items}</ol></section>"

    body = re.sub(r"\\begin\{thebibliography\}\{[^}]*\}(.*?)\\end\{thebibliography\}", _replace, body, flags=re.DOTALL)
    body = re.sub(r"\\bibliography\{[^}]+\}", "<p class='latex-bib-note'>[Bibliography from .bib file — not rendered in preview]</p>", body)
    body = re.sub(r"\\bibliographystyle\{[^}]+\}", "", body)
    return body


# ---------------------------------------------------------------------------
# Stripper for preamble-only commands in body
# ---------------------------------------------------------------------------

def _strip_body_preamble_commands(body: str) -> str:
    """Remove preamble and metadata commands that sometimes appear in body."""
    # Strip \title{...}, \author{...}, \date{...} with balanced braces
    for cmd in ("title", "author", "date"):
        while True:
            m = re.search(rf"\\{cmd}\s*\{{", body)
            if not m:
                break
            depth = 0
            end = -1
            for i in range(m.end() - 1, len(body)):
                if body[i] == '{':
                    depth += 1
                elif body[i] == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end != -1:
                body = body[:m.start()] + body[end:]
            else:
                break

    patterns = [
        r"\\def\\BibTeX\{[^}]*\}",
        r"\\def\\[a-zA-Z]+\{[^}]*\}",
        r"\\(?:documentclass|usepackage|geometry|pagestyle|setlength|renewcommand|newcommand"
        r"|DeclareMathOperator|setcounter|includeonly|graphicspath|bibliographystyle"
        r"|linespread|fontsize|selectfont|setlist|titlespacing|fancyhf|fancyhead|fancyfoot"
        r"|rhead|lhead|chead|rfoot|lfoot|cfoot|thispagestyle|pagenumbering)(?:\[[^\]]*\])?"
        r"(?:\{[^}]*\})*"
    ]
    for p in patterns:
        body = re.sub(p, "", body)
    return body


# ---------------------------------------------------------------------------
# PyMuPDF High-Fidelity PDF Compiler
# ---------------------------------------------------------------------------

ACADEMIC_PDF_CSS = """
body {
    font-family: 'Times New Roman', serif;
    font-size: 8.5pt;
    line-height: 1.25;
    text-align: justify;
    margin: 0;
    padding: 0;
    color: #000;
}
h1.latex-doc-title {
    font-size: 14pt;
    font-weight: bold;
    text-align: center;
    margin: 0 0 6pt 0;
    line-height: 1.2;
}
.latex-doc-author {
    font-size: 9pt;
    text-align: center;
    margin: 0 0 8pt 0;
    line-height: 1.35;
}
.author-name {
    font-weight: bold;
    display: block;
    margin-bottom: 2pt;
}
.author-affil {
    font-size: 8pt;
    color: #333;
    display: block;
    font-style: italic;
}
.latex-abstract {
    margin: 0 0 8pt 0;
}
.latex-abstract h4 {
    display: inline;
    font-size: 8.5pt;
    font-weight: bold;
    font-style: italic;
    margin-right: 4pt;
}
.latex-abstract p {
    display: inline;
    font-weight: bold;
    font-size: 8.5pt;
    text-indent: 0;
}
.latex-keywords {
    font-size: 8.5pt;
    margin: 4pt 0 8pt 0;
}
.latex-keywords strong {
    font-style: italic;
}
h2.latex-section {
    font-size: 9.5pt;
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
    margin: 10pt 0 4pt 0;
    border-bottom: none;
}
h3.latex-subsection {
    font-size: 9pt;
    font-weight: bold;
    font-style: italic;
    margin: 8pt 0 3pt 0;
}
h4.latex-subsubsection {
    font-size: 8.5pt;
    font-style: italic;
    margin: 6pt 0 2pt 0;
}
p {
    margin: 0 0 5pt 0;
    text-indent: 14pt;
}
p:first-of-type, .latex-abstract p, .latex-keywords p {
    text-indent: 0;
}
table.latex-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.5pt;
    margin: 6pt 0;
}
table.latex-table th, table.latex-table td {
    padding: 3pt 4pt;
    text-align: left;
    border-bottom: 0.5pt solid #444;
}
table.latex-table th {
    border-top: 1.2pt solid #000;
    border-bottom: 1.2pt solid #000;
    font-weight: bold;
}
figure.latex-table-float {
    margin: 8pt 0;
    text-align: center;
}
figcaption.latex-caption {
    font-size: 8pt;
    font-weight: bold;
    margin-bottom: 3pt;
    text-align: center;
}
ul, ol {
    margin: 3pt 0 5pt 14pt;
    padding: 0;
}
li {
    margin-bottom: 2pt;
    text-indent: 0;
}
.latex-cite, .latex-ref {
    font-size: 8pt;
    font-weight: 500;
}
.latex-bibliography h2 {
    font-size: 9pt;
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
    margin: 10pt 0 4pt 0;
}
.latex-bibliography ol {
    margin-left: 14pt;
    font-size: 7.5pt;
}
.latex-bibliography li {
    margin-bottom: 3pt;
    line-height: 1.2;
}
"""


def compile_latex_to_pdf_bytes(latex_src: str, html_body: str, meta: Dict[str, Any]) -> Tuple[Optional[bytes], List[str]]:
    """
    Compiles LaTeX to a real multi-page PDF document using PyMuPDF's Story engine.
    Renders pages as base64 PNG data URLs for direct, crisp display in the browser.
    Returns: (pdf_bytes, [list_of_base64_page_png_urls])
    """
    if not fitz:
        return None, []

    page_data_urls: List[str] = []
    pdf_bytes: Optional[bytes] = None

    try:
        story = fitz.Story(user_css=ACADEMIC_PDF_CSS, html=html_body)

        col1_norm = fitz.Rect(40, 40, 290, 800)
        col2_norm = fitz.Rect(305, 40, 555, 800)

        def rectfn(n, filled):
            mb = fitz.Rect(0, 0, 595.3, 841.9) if (n % 2 == 0) else None
            col = col1_norm if (n % 2 == 0) else col2_norm
            return (mb, col, None)

        writer = fitz.DocumentWriter("draft_preview.pdf")
        story.write(writer, rectfn)
        writer.close()

        doc = fitz.open("draft_preview.pdf")
        if len(doc) == 0:
            doc.insert_page(0, width=595.3, height=841.9)

        pdf_bytes = doc.tobytes()

        # Render high-resolution PNG for each page
        for page in doc:
            pix = page.get_pixmap(dpi=150)
            png_bytes = pix.tobytes("png")
            b64 = base64.b64encode(png_bytes).decode("ascii")
            page_data_urls.append(f"data:image/png;base64,{b64}")

        doc.close()
    except Exception as e:
        print(f"[latex_compiler] PDF compile warning: {e}")

    return pdf_bytes, page_data_urls


# ---------------------------------------------------------------------------
# Main compile function
# ---------------------------------------------------------------------------

def compile_latex_to_html(latex_src: str) -> Dict[str, Any]:
    """
    Convert a LaTeX source string to an HTML preview and compiled PDF pages.

    Returns:
        {
            "html": "<html preview string>",
            "pdf_pages": ["data:image/png;base64,...", ...],
            "has_pdf": bool,
            "warnings": ["list", "of", "warning strings"],
            "meta": { "title": …, "author": … }
        }
    """
    warnings: List[str] = []

    # 1. Strip comments
    src = _strip_comments(latex_src)

    # 2. Protect verbatim blocks first
    src = _protect_verbatim(src)

    # 3. Protect math
    src = _protect_math(src)

    # 4. Extract preamble metadata and body
    meta, body = _extract_preamble_body(src)

    # 5. Strip leftover preamble commands from body
    body = _strip_body_preamble_commands(body)

    # 6. \maketitle
    body = _convert_maketitle(body, meta)

    # 7. Abstract & Keywords
    body = _convert_abstract(body)
    body = _convert_keywords(body)

    # 8. Environments (order matters: tabular before table floats)
    body = _convert_tabular(body)
    body = _convert_table_float(body)
    body = _convert_figure(body)
    body = _convert_itemize(body)
    body = _convert_enumerate(body)
    body = _convert_description(body)
    body = _convert_quote(body)
    body = _convert_equation_env(body)

    # 9. Bibliography
    body = _convert_bibliography(body)

    # 10. Sections
    body = _convert_sections(body)

    # 11. Inline commands
    body = _process_inline(body)

    # 12. Paragraph wrapping
    body = _convert_paragraphs(body)

    # 13. Restore placeholders
    body = _restore_verbatim(body)
    body = _restore_math(body)

    # 14. Detect unknown commands for warnings
    unknown_cmds = set(re.findall(r"\\([a-zA-Z]+)", body))
    unknown_cmds = {c for c in unknown_cmds if c not in {"br", "amp", "lt", "gt", "quot"}}
    if unknown_cmds:
        warnings.append(f"Unknown or unsupported LaTeX commands: {', '.join(sorted(unknown_cmds))}")

    # 15. Compile to real PDF pages using PyMuPDF
    pdf_bytes, pdf_pages = compile_latex_to_pdf_bytes(latex_src, body, meta)

    return {
        "html": body,
        "pdf_pages": pdf_pages,
        "has_pdf": len(pdf_pages) > 0,
        "warnings": warnings,
        "meta": meta,
    }
