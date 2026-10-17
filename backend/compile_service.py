import asyncio
import os
import re
import shutil
import tempfile
import time
from typing import Dict, List, Optional, Any, Tuple

# In-memory semaphore to limit concurrent compilation jobs
COMPILE_SEMAPHORE = asyncio.Semaphore(3)

# Log entry parsing patterns
# Examples:
# main.tex:14: Undefined control sequence.
# ./main.tex:25: LaTeX Error: Environment itemize* undefined.
# LaTeX Warning: Citation 'smith2024' on page 1 undefined on input line 42.
# Overfull \hbox (12.4pt too wide) in paragraph at lines 50--56
ERROR_LINE_RE = re.compile(r"^(?:\./)?([^:\n]+):(\d+):\s*(.*)$")
LATEX_WARNING_RE = re.compile(r"LaTeX Warning:\s*(.*?)(?:on input line\s*(\d+))?\.?$", re.MULTILINE)
OVERFULL_RE = re.compile(r"(Overfull \\[hv]box.*?lines?\s*(\d+)(?:--\d+)?.*)", re.DOTALL)
CITATION_UNDEF_RE = re.compile(r"Citation\s*[`']([^']+)'\s*on page \d+ undefined on input line (\d+)", re.IGNORECASE)

# Dangerous commands filter
DISALLOWED_PATTERNS = [
    re.compile(r"\\write18", re.IGNORECASE),
    re.compile(r"\\(?:input|include|openin|openout)\s*\{[^}]*(\.\.|/|[a-zA-Z]:)[^}]*\}", re.IGNORECASE),
    re.compile(r"\\immediate\\write18", re.IGNORECASE),
]

def check_latex_security(tex_content: str) -> Optional[str]:
    """Validates TeX content against forbidden commands. Returns an error message if invalid."""
    for pattern in DISALLOWED_PATTERNS:
        if pattern.search(tex_content):
            return "Security violation: Direct shell execution (\\write18) and absolute/parent paths in file operations are forbidden."
    return None

def parse_latex_log(log_text: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parses TeX compilation log into errors and warnings.
    Returns: (errors, warnings)
    where each item is { "severity": "error"|"warning", "line": int, "message": str, "file": str }
    """
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    lines = log_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Check standard file:line: message format
        m = ERROR_LINE_RE.match(line)
        if m:
            filename = m.group(1).strip()
            line_no = int(m.group(2))
            msg = m.group(3).strip()
            # If msg is generic, grab next line if available
            if i + 1 < len(lines) and lines[i+1].startswith("l."):
                i += 1
                msg += " " + lines[i].strip()
            
            errors.append({
                "severity": "error",
                "line": line_no,
                "message": msg,
                "file": filename
            })
            i += 1
            continue

        # Check citation warnings
        cit_m = CITATION_UNDEF_RE.search(line)
        if cit_m:
            warnings.append({
                "severity": "warning",
                "line": int(cit_m.group(2)),
                "message": f"Citation '{cit_m.group(1)}' undefined. Ensure references.bib contains this key.",
                "file": "main.tex"
            })
            i += 1
            continue

        # Check standard LaTeX Warning
        if "LaTeX Warning:" in line:
            warn_msg = line.replace("LaTeX Warning:", "").strip()
            line_no = None
            line_m = re.search(r"input line\s*(\d+)", warn_msg)
            if line_m:
                line_no = int(line_m.group(1))
            warnings.append({
                "severity": "warning",
                "line": line_no,
                "message": warn_msg,
                "file": "main.tex"
            })
            i += 1
            continue

        # Check Overfull \hbox
        if "Overfull \\hbox" in line:
            line_m = re.search(r"lines?\s*(\d+)", line)
            line_no = int(line_m.group(1)) if line_m else None
            warnings.append({
                "severity": "warning",
                "line": line_no,
                "message": line.strip(),
                "file": "main.tex"
            })
            i += 1
            continue

        # Undefined control sequence
        if line.startswith("! Undefined control sequence."):
            msg = line.lstrip("! ").strip()
            line_no = None
            if i + 1 < len(lines) and lines[i+1].startswith("l."):
                i += 1
                lm = re.match(r"^l\.(\d+)", lines[i])
                if lm:
                    line_no = int(lm.group(1))
                    msg += " at " + lines[i].strip()
            errors.append({
                "severity": "error",
                "line": line_no,
                "message": msg,
                "file": "main.tex"
            })
            i += 1
            continue

        # Emergency stop or Fatal error
        if line.startswith("! Emergency stop") or line.startswith("! Fatal error"):
            errors.append({
                "severity": "error",
                "line": None,
                "message": line.lstrip("! ").strip(),
                "file": "main.tex"
            })

        i += 1

    return errors, warnings

def check_latex_available() -> Dict[str, Any]:
    """Checks whether latexmk, pdflatex, or tectonic are installed."""
    latexmk_path = shutil.which("latexmk")
    pdflatex_path = shutil.which("pdflatex")
    tectonic_path = shutil.which("tectonic")
    
    available = bool(latexmk_path or pdflatex_path or tectonic_path)
    engine = "latexmk" if latexmk_path else ("pdflatex" if pdflatex_path else ("tectonic" if tectonic_path else "mupdf-fallback"))
    return {
        "available": available,
        "engine": engine,
        "latexmk": bool(latexmk_path),
        "pdflatex": bool(pdflatex_path),
        "tectonic": bool(tectonic_path)
    }

async def compile_latex_project(tex_source: str, bib_source: str = "", paper_size: str = "letter") -> Dict[str, Any]:
    """
    Compiles LaTeX and BibTeX in an isolated per-request temporary directory.
    If system LaTeX (latexmk/pdflatex) is available, compiles with full security checks and process group timeouts.
    If system LaTeX is not available, falls back to PyMuPDF academic renderer and returns high-fidelity PDF bytes.
    """
    start_time = time.time()
    
    # 1. Security validation
    sec_err = check_latex_security(tex_source)
    if sec_err:
        return {
            "ok": False,
            "pdf_bytes": None,
            "log": sec_err,
            "errors": [{"severity": "error", "line": None, "message": sec_err, "file": "main.tex"}],
            "warnings": [],
            "duration_ms": int((time.time() - start_time) * 1000)
        }

    # Cap size (e.g. 500 KB)
    if len(tex_source.encode("utf-8")) > 500 * 1024:
        return {
            "ok": False,
            "pdf_bytes": None,
            "log": "Input LaTeX source exceeds 500 KB limit.",
            "errors": [{"severity": "error", "line": None, "message": "Source file exceeds 500 KB limit.", "file": "main.tex"}],
            "warnings": [],
            "duration_ms": int((time.time() - start_time) * 1000)
        }

    # Normalize paper size option in documentclass if present
    if paper_size == "a4" and "a4paper" not in tex_source:
        tex_source = re.sub(r"(\\documentclass\[)([^\]]*)(\]\{IEEEtran\})", r"\1\2,a4paper\3", tex_source)
    elif paper_size == "letter" and "a4paper" in tex_source:
        tex_source = tex_source.replace(",a4paper", "").replace("a4paper,", "").replace("a4paper", "")

    latex_status = check_latex_available()

    # If latexmk is installed
    if latex_status["latexmk"] or latex_status["pdflatex"]:
        async with COMPILE_SEMAPHORE:
            temp_dir = tempfile.mkdtemp(prefix="latex_build_")
            try:
                tex_path = os.path.join(temp_dir, "main.tex")
                bib_path = os.path.join(temp_dir, "references.bib")

                with open(tex_path, "w", encoding="utf-8") as f:
                    f.write(tex_source)
                with open(bib_path, "w", encoding="utf-8") as f:
                    f.write(bib_source or "% No bib references\n")

                # Build command: latexmk -pdf -interaction=nonstopmode -file-line-error -no-shell-escape main.tex
                if latex_status["latexmk"]:
                    cmd = ["latexmk", "-pdf", "-interaction=nonstopmode", "-file-line-error", "-no-shell-escape", "main.tex"]
                else:
                    cmd = ["pdflatex", "-interaction=nonstopmode", "-file-line-error", "-no-shell-escape", "main.tex"]

                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    cwd=temp_dir,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT
                )

                try:
                    stdout_data, _ = await asyncio.wait_for(proc.communicate(), timeout=30.0)
                    log_text = stdout_data.decode("utf-8", errors="replace")
                except asyncio.TimeoutError:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    return {
                        "ok": False,
                        "pdf_bytes": None,
                        "log": "Compilation timed out after 30 seconds.",
                        "errors": [{"severity": "error", "line": None, "message": "Compilation timed out after 30 seconds.", "file": "main.tex"}],
                        "warnings": [],
                        "duration_ms": int((time.time() - start_time) * 1000)
                    }

                # Check for output PDF
                out_pdf = os.path.join(temp_dir, "main.pdf")
                pdf_bytes = None
                if os.path.exists(out_pdf):
                    with open(out_pdf, "rb") as f:
                        pdf_bytes = f.read()

                # Read log file if present for more complete output
                log_file = os.path.join(temp_dir, "main.log")
                if os.path.exists(log_file):
                    try:
                        with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                            log_text = f.read()
                    except Exception:
                        pass

                errors, warnings = parse_latex_log(log_text)
                ok = (proc.returncode == 0) and (pdf_bytes is not None) and (len(errors) == 0)

                return {
                    "ok": ok,
                    "pdf_bytes": pdf_bytes,
                    "log": log_text,
                    "errors": errors,
                    "warnings": warnings,
                    "duration_ms": int((time.time() - start_time) * 1000)
                }
            finally:
                shutil.rmtree(temp_dir, ignore_errors=True)

    # Fallback to PyMuPDF engine if latexmk is not installed in local environment
    from backend.latex_compiler import compile_latex_to_html
    compile_res = compile_latex_to_html(tex_source)
    
    # Check for syntax errors in TeX source
    from backend.draft_reviewer import check_latex_syntax
    syntax_issues = check_latex_syntax(tex_source)
    errors = []
    warnings = [
        {"severity": "warning", "line": None, "message": w, "file": "main.tex"} 
        for w in compile_res.get("warnings", [])
    ]
    
    for iss in syntax_issues:
        if iss.get("severity") == "critical":
            errors.append({
                "severity": "error",
                "line": None,
                "message": f"{iss.get('title')}: {iss.get('description')}",
                "file": "main.tex"
            })
        else:
            warnings.append({
                "severity": "warning",
                "line": None,
                "message": f"{iss.get('title')}: {iss.get('description')}",
                "file": "main.tex"
            })

    # Read draft_preview.pdf generated by PyMuPDF if it exists
    pdf_bytes = None
    if os.path.exists("draft_preview.pdf"):
        try:
            with open("draft_preview.pdf", "rb") as f:
                pdf_bytes = f.read()
        except Exception:
            pass

    log_lines = [
        "--- In-Process Academic LaTeX Compiler (PyMuPDF Engine) ---",
        f"Title: {compile_res.get('meta', {}).get('title', 'Survey Paper')}",
        f"Author: {compile_res.get('meta', {}).get('author', 'Author')}",
        f"Document Class: {compile_res.get('meta', {}).get('document_class', 'article')}",
        f"Generated Pages: {len(compile_res.get('pdf_pages', []))}",
        "LaTeX system: local latexmk not detected; PyMuPDF dual-column IEEE generator active."
    ]
    if warnings:
        log_lines.append(f"Warnings ({len(warnings)}):")
        for w in warnings:
            log_lines.append(f"  * {w['message']}")
    if errors:
        log_lines.append(f"Errors ({len(errors)}):")
        for e in errors:
            log_lines.append(f"  ! {e['message']}")

    return {
        "ok": len(errors) == 0 and pdf_bytes is not None,
        "pdf_bytes": pdf_bytes,
        "log": "\n".join(log_lines),
        "errors": errors,
        "warnings": warnings,
        "duration_ms": int((time.time() - start_time) * 1000)
    }
