import os
import re
import hashlib
from typing import Dict, List, Any, Tuple
import pymupdf

STANDARD_SECTIONS = [
    "abstract", "introduction", "background", "related work", "literature review",
    "methodology", "method", "methods", "approach", "architecture", "system design",
    "implementation", "experimental setup", "experiments", "results", "evaluation",
    "discussion", "comparative analysis", "open challenges", "future work",
    "future directions", "conclusion", "references", "acknowledgments"
]

def calculate_sha256(file_path: str) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()

def clean_text(text: str) -> str:
    # Normalize unicode whitespace and line breaks
    text = re.sub(r"\r\n|\r", "\n", text)
    # Remove excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Fix hyphenation at line breaks (e.g. "com-\nputer" -> "computer")
    text = re.sub(r"(\w+)-\n(\w+)", r"\1\2", text)
    return text.strip()

def is_likely_heading(line: str, font_size: float = 0, is_bold: bool = False) -> bool:
    line = line.strip()
    if not line or len(line) > 100:
        return False
    # Check numbering patterns like "1. Introduction", "II. RELATED WORK", "3.1 Methods"
    number_pattern = re.match(r"^(\d+(\.\d+)*|[I|V|X]+)\.?\s+[A-Z]", line)
    if number_pattern:
        return True
    # Check lowercase match with standard sections
    lower = line.lower().rstrip(":")
    if lower in STANDARD_SECTIONS:
        return True
    # If all caps and short
    if line.isupper() and len(line.split()) <= 6:
        return True
    return False

def parse_pdf(file_path: str) -> Dict[str, Any]:
    """
    Parses a PDF file using PyMuPDF.
    Returns:
        title, authors, abstract, sections (list of {title, page, text}),
        page_count, word_count, warnings, sha256
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    sha256 = calculate_sha256(file_path)

    try:
        doc = pymupdf.open(file_path)
    except Exception as e:
        raise ValueError(f"Corrupted or invalid PDF file: {str(e)}")

    if doc.is_encrypted:
        doc.close()
        raise ValueError("PDF is password-protected or encrypted. Please upload an unlocked PDF.")

    page_count = len(doc)
    if page_count == 0:
        doc.close()
        raise ValueError("The uploaded PDF has 0 pages.")

    warnings = []
    if page_count > 50:
        warnings.append(f"Document has {page_count} pages; this is unusually long for a standard conference/journal paper (may be a thesis or book).")

    full_text_pages = []
    total_words = 0
    detected_sections = []
    
    # Track text blocks with page numbers
    all_blocks = []
    
    for page_num in range(page_count):
        page = doc[page_num]
        # Text extraction with blocks
        blocks = page.get_text("blocks") # (x0, y0, x1, y1, text, block_no, block_type)
        page_text = ""
        for b in blocks:
            if len(b) >= 5 and b[4]:
                b_text = b[4].strip()
                if b_text:
                    page_text += b_text + "\n\n"
                    all_blocks.append({"text": b_text, "page": page_num + 1})
        cleaned_page_text = clean_text(page_text)
        full_text_pages.append({"page": page_num + 1, "text": cleaned_page_text})
        total_words += len(cleaned_page_text.split())

    # Check for scanned / unreadable PDF
    avg_words_per_page = total_words / max(page_count, 1)
    if total_words < 60 or avg_words_per_page < 35:
        warnings.append("Low text density detected (<35 words/page). The document may be a scanned image or corrupted PDF without an OCR text layer.")

    # Extract Title, Authors, Abstract from early pages (page 1-2)
    doc_metadata = doc.metadata or {}
    pdf_meta_title = doc_metadata.get("title", "").strip()
    pdf_meta_author = doc_metadata.get("author", "").strip()

    first_page_text = full_text_pages[0]["text"] if full_text_pages else ""
    first_page_lines = [line.strip() for line in first_page_text.split("\n") if line.strip()]

    # Extract Title heuristics:
    extracted_title = ""
    if pdf_meta_title and len(pdf_meta_title) > 5 and not pdf_meta_title.lower().endswith(".pdf") and "untitled" not in pdf_meta_title.lower():
        extracted_title = pdf_meta_title
    else:
        # Candidate from first 5 lines of first page
        candidate_lines = []
        for line in first_page_lines[:6]:
            if line.lower() in ["abstract", "ieee", "arxiv", "proceedings"]:
                break
            if len(line) > 4:
                candidate_lines.append(line)
                if len(candidate_lines) >= 3:
                    break
        if candidate_lines:
            extracted_title = " ".join(candidate_lines)
    
    if not extracted_title:
        extracted_title = os.path.splitext(os.path.basename(file_path))[0].replace("_", " ").replace("-", " ").title()

    # Extract Authors heuristic
    extracted_authors = pdf_meta_author
    if not extracted_authors and len(first_page_lines) > 2:
        # Check lines right below title before "abstract"
        for i, line in enumerate(first_page_lines[1:8], start=1):
            if "abstract" in line.lower():
                break
            if "@" in line or "university" in line.lower() or "department" in line.lower() or "institute" in line.lower():
                extracted_authors = first_page_lines[i-1] if i > 1 else line
                break

    # Extract Abstract
    extracted_abstract = ""
    full_text_combined = "\n\n".join([p["text"] for p in full_text_pages])
    abstract_match = re.search(
        r"(?:abstract|summary)[\s:—–-]+([\s\S]{100,2500}?)(?=\n\s*(?:(?:1|I)?\s*\.?\s*introduction|background|keywords|index terms|1\.|\n\n[A-Z\s]{4,}))",
        full_text_combined,
        re.IGNORECASE
    )
    if abstract_match:
        extracted_abstract = clean_text(abstract_match.group(1))
    else:
        # Fallback: find paragraph after the word "Abstract"
        for i, line in enumerate(first_page_lines):
            if line.lower().startswith("abstract"):
                # Take subsequent lines
                para = " ".join(first_page_lines[i+1:i+10])
                extracted_abstract = para[:1200]
                break

    # Extract Sections
    current_section = "Introduction"
    section_texts = {current_section: {"page": 1, "text": []}}

    for block in all_blocks:
        lines = block["text"].split("\n")
        first_line = lines[0].strip() if lines else ""
        if is_likely_heading(first_line):
            heading = first_line.rstrip(":")
            # Normalize heading name
            heading = re.sub(r"^(\d+(\.\d+)*|[I|V|X]+)\.?\s*", "", heading).strip()
            if len(heading) > 2:
                current_section = heading.title()
                if current_section not in section_texts:
                    section_texts[current_section] = {"page": block["page"], "text": []}
                # Remaining lines in block go to this section
                rest = "\n".join(lines[1:]).strip()
                if rest:
                    section_texts[current_section]["text"].append(rest)
                continue
        
        # Add to current section
        section_texts[current_section]["text"].append(block["text"])

    sections_list = []
    for s_name, s_data in section_texts.items():
        joined = "\n\n".join(s_data["text"]).strip()
        if len(joined) > 50:
            sections_list.append({
                "title": s_name,
                "page": s_data["page"],
                "word_count": len(joined.split()),
                "preview": joined[:300]
            })

    doc.close()

    return {
        "title": extracted_title.strip()[:300],
        "authors": (extracted_authors or "Not specified").strip()[:300],
        "abstract": extracted_abstract.strip(),
        "sections": sections_list,
        "page_count": page_count,
        "word_count": total_words,
        "warnings": warnings,
        "sha256": sha256,
        "pages": full_text_pages
    }

def chunk_paper(paper_id: str, project_id: str, parsed_data: Dict[str, Any], chunk_size: int = 450, chunk_overlap: int = 80) -> List[Dict[str, Any]]:
    """
    Chunks parsed paper pages into sliding window text chunks with page number & section header provenance.
    """
    chunks = []
    chunk_index = 0

    # If we have parsed pages:
    for page_info in parsed_data.get("pages", []):
        page_num = page_info["page"]
        text = page_info["text"]
        words = text.split()
        if not words:
            continue

        # Step by chunk_size - chunk_overlap
        step = max(chunk_size - chunk_overlap, 100)
        for i in range(0, len(words), step):
            window_words = words[i:i + chunk_size]
            if len(window_words) < 25 and chunks:
                # Merge short trailing fragment into previous chunk
                chunks[-1]["content"] += " " + " ".join(window_words)
                continue
            
            chunk_content = " ".join(window_words)
            
            # Determine nearest section title
            section_title = "General"
            for sec in parsed_data.get("sections", []):
                if sec["page"] <= page_num:
                    section_title = sec["title"]

            chunks.append({
                "project_id": project_id,
                "paper_id": paper_id,
                "chunk_index": chunk_index,
                "page_num": page_num,
                "section_title": section_title,
                "content": chunk_content
            })
            chunk_index += 1

    return chunks
