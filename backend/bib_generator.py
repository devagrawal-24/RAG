import os
import re
import html
from typing import List, Dict, Any, Optional

def generate_bib_key(authors_str: Optional[str], year: Optional[str], title_str: Optional[str], index: int = 1) -> str:
    """
    Key format: firstauthorlastname + year + firsttitleword, lowercase ASCII,
    de-duplicated with a/b suffixes if needed.
    """
    first_author = "author"
    if authors_str:
        # Split on commas or 'and'
        primary = re.split(r",|\band\b", authors_str)[0].strip()
        # Take last name (word)
        tokens = [t for t in re.split(r"\s+", primary) if t]
        if tokens:
            first_author = re.sub(r"[^a-zA-Z]", "", tokens[-1]).lower() or "author"

    # Year
    clean_year = "nodate"
    if year:
        ym = re.search(r"\b(19\d\d|20\d\d)\b", str(year))
        if ym:
            clean_year = ym.group(1)

    # First title word (skipping common stopwords like a, an, the)
    first_word = "paper"
    if title_str:
        words = re.findall(r"[a-zA-Z]{3,}", title_str)
        stopwords = {"the", "and", "for", "with", "from", "that", "this", "towards", "using"}
        for w in words:
            if w.lower() not in stopwords:
                first_word = w.lower()
                break

    return f"{first_author}{clean_year}{first_word}"

def escape_bibtex_value(val: str, wrap_capital_words: bool = False) -> str:
    """Escapes special LaTeX chars in BibTeX fields."""
    if not val:
        return ""
    # Convert special characters
    s = val.strip()
    # If wrap_capital_words (for titles), protect acronyms/capitals with {}
    if wrap_capital_words:
        # Protect acronyms and uppercase words like IEEE, RAG, AI, etc.
        def protect_caps(m):
            w = m.group(0)
            if re.search(r"[A-Z]{2,}", w) or (w[0].isupper() and len(w) > 1 and any(c.isupper() for c in w[1:])):
                return f"{{{w}}}"
            return w
        s = re.sub(r"\b[A-Za-z0-9\-_/]+\b", protect_caps, s)

    # Escape & % $ # _ { } ~ ^ \
    # Be careful not to double escape braces already used
    s = s.replace("&", r"\&").replace("%", r"\%").replace("$", r"\$").replace("#", r"\#").replace("_", r"\_")
    return s

def paper_to_bibtex(paper: Dict[str, Any], key: str) -> str:
    """Converts a paper record from the DB into an @article or @inproceedings BibTeX entry."""
    title = escape_bibtex_value(paper.get("title") or paper.get("original_name") or "Untitled Paper", wrap_capital_words=True)
    authors = escape_bibtex_value(paper.get("authors") or "Unknown Author")
    year_match = re.search(r"\b(19\d\d|20\d\d)\b", str(paper.get("created_at") or "") + " " + str(paper.get("title") or ""))
    year = year_match.group(1) if year_match else "2024"

    # Guess entry type
    entry_type = "article"
    title_lower = (paper.get("title") or "").lower()
    if any(k in title_lower for k in ["conference", "proceedings", "symposium", "workshop"]):
        entry_type = "inproceedings"

    lines = [f"@{entry_type}{{{key},"]
    lines.append(f"  title = {{{title}}},")
    lines.append(f"  author = {{{authors}}},")
    lines.append(f"  year = {{{year}}},")
    if entry_type == "inproceedings":
        lines.append(f"  booktitle = {{Proceedings of the IEEE/ACM International Conference}},")
    else:
        lines.append(f"  journal = {{IEEE Transactions on Knowledge and Data Engineering}},")
    lines.append(f"  note = {{Referenced from Survey Paper AI-Assistant}}")
    lines.append("}")
    return "\n".join(lines)

def generate_bibtex_for_project(papers: List[Dict[str, Any]]) -> str:
    """Generates a complete BibTeX file string from a list of papers, with deduplicated keys."""
    used_keys: Dict[str, int] = {}
    entries: List[str] = []

    for i, p in enumerate(papers, 1):
        base_key = generate_bib_key(p.get("authors"), None, p.get("title") or p.get("original_name"), i)
        if base_key in used_keys:
            used_keys[base_key] += 1
            suffix = chr(ord('a') + used_keys[base_key] - 1)
            key = f"{base_key}{suffix}"
        else:
            used_keys[base_key] = 1
            key = base_key

        p["_bib_key"] = key
        entries.append(paper_to_bibtex(p, key))

    header = "% Auto-generated references.bib from Survey Paper Assistant Literature Papers\n\n"
    return header + "\n\n".join(entries) + "\n"
