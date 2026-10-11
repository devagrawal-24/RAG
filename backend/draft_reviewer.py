import re
import math
from typing import Dict, List, Any, Tuple

REQUIRED_SURVEY_SECTIONS = [
    {"name": "Introduction", "keywords": ["introduction", "overview", "background"]},
    {"name": "Taxonomy / Categorization", "keywords": ["taxonomy", "classification", "categorization", "approaches", "frameworks"]},
    {"name": "Comparative Analysis", "keywords": ["comparative", "comparison", "matrix", "evaluation", "benchmarks", "analysis"]},
    {"name": "Open Challenges", "keywords": ["open challenges", "challenges", "limitations", "unresolved", "issues"]},
    {"name": "Future Directions", "keywords": ["future", "future directions", "future work", "roadmap", "trends"]},
    {"name": "Conclusion & References", "keywords": ["conclusion", "concluding", "references", "bibliography"]}
]

TRANSITION_WORDS = {
    "however", "moreover", "furthermore", "in contrast", "on the other hand",
    "subsequently", "consequently", "therefore", "thus", "specifically",
    "in addition", "similarly", "nevertheless", "despite", "although", "notably"
}

def count_syllables(word: str) -> int:
    word = word.lower().strip(".:;,?!\"'()")
    if not word:
        return 0
    if len(word) <= 3:
        return 1
    # Count vowel sequences
    vowels = "aeiouy"
    count = len(re.findall(r"[aeiouy]+", word))
    if word.endswith("e") and not word.endswith("le"):
        count = max(1, count - 1)
    return max(1, count)

def strip_latex_commands(text: str) -> str:
    """Strips LaTeX commands and comments to leave clean prose for readability metrics."""
    # Remove comments
    clean = re.sub(r"%.*", "", text)
    # Remove preamble commands
    clean = re.sub(r"\\(?:documentclass|usepackage|geometry|setlist|titlespacing|setlength|title|author|date)\b(?:\[[^\]]*\])?(?:\{[^\}]*\})*", "", clean)
    # Convert section headings to text
    clean = re.sub(r"\\(?:sub)*section\*?\{([^\}]+)\}", r"\1.", clean)
    # Convert text formatting commands
    clean = re.sub(r"\\(?:textbf|textit|emph|texttt|caption|label|cite|ref)\{([^\}]+)\}", r"\1", clean)
    # Remove \begin{...} and \end{...}
    clean = re.sub(r"\\[be][en]gin\{[^\}]+\}", "", clean)
    # Remove remaining backslash commands
    clean = re.sub(r"\\[a-zA-Z]+\b", "", clean)
    return clean.strip()

def check_latex_syntax(text: str) -> List[Dict[str, Any]]:
    """Audits LaTeX environment balance and core document structure."""
    issues = []
    
    # Check document structure
    if "\\begin{document}" in text and "\\end{document}" not in text:
        issues.append({
            "category": "syntax",
            "severity": "critical",
            "location": "LaTeX Document Structure",
            "title": "Unclosed LaTeX Document Environment",
            "description": "Found '\\begin{document}' without a matching '\\end{document}'.",
            "suggestion": "Add '\\end{document}' at the end of your LaTeX file."
        })

    # Environment stack verification
    begins = re.findall(r"\\begin\{([a-zA-Z0-9_\*]+)\}", text)
    ends = re.findall(r"\\end\{([a-zA-Z0-9_\*]+)\}", text)
    
    begin_counts = {}
    for b in begins:
        begin_counts[b] = begin_counts.get(b, 0) + 1
    end_counts = {}
    for e in ends:
        end_counts[e] = end_counts.get(e, 0) + 1

    for env, count in begin_counts.items():
        e_count = end_counts.get(env, 0)
        if count > e_count:
            issues.append({
                "category": "syntax",
                "severity": "critical",
                "location": f"LaTeX Environment '\\begin{{{env}}}'",
                "title": f"Unmatched LaTeX Environment: {env}",
                "description": f"Environment '\\begin{{{env}}}' occurs {count} time(s) but '\\end{{{env}}}' occurs {e_count} time(s).",
                "suggestion": f"Add '\\end{{{env}}}' to close the environment properly."
            })

    return issues

def compute_readability_metrics(text: str) -> Dict[str, Any]:
    prose = strip_latex_commands(text) if "\\" in text else text
    paragraphs = [p.strip() for p in prose.split("\n\n") if p.strip()]
    sentences = re.split(r"(?<=[.!?])\s+", prose)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 3]

    words = re.findall(r"\b[A-Za-z0-9_-]+\b", prose)
    total_words = len(words)
    total_sentences = max(len(sentences), 1)
    total_paragraphs = max(len(paragraphs), 1)

    if total_words == 0:
        return {
            "flesch_reading_ease": 0.0,
            "gunning_fog": 0.0,
            "avg_sentence_length": 0.0,
            "total_words": 0,
            "total_sentences": 0,
            "total_paragraphs": 0,
            "complex_word_count": 0,
            "grade_level": "N/A"
        }

    total_syllables = sum(count_syllables(w) for w in words)
    complex_words = sum(1 for w in words if count_syllables(w) >= 3)

    asl = total_words / total_sentences
    asw = total_syllables / total_words

    fre = 206.835 - (1.015 * asl) - (84.6 * asw)
    fre = max(0.0, min(100.0, round(fre, 1)))

    percent_complex = (complex_words / total_words) * 100.0
    fog = 0.4 * (asl + percent_complex)
    fog = round(fog, 1)

    if fre >= 60:
        grade = "Standard (Undergraduate)"
    elif fre >= 40:
        grade = "Scholarly (Graduate / Professional)"
    else:
        grade = "Dense Academic (Very Challenging)"

    return {
        "flesch_reading_ease": fre,
        "gunning_fog": fog,
        "avg_sentence_length": round(asl, 1),
        "total_words": total_words,
        "total_sentences": total_sentences,
        "total_paragraphs": total_paragraphs,
        "complex_word_count": complex_words,
        "grade_level": grade
    }

def check_structural_completeness(text: str) -> List[Dict[str, Any]]:
    issues = []
    text_lower = text.lower()

    for sec in REQUIRED_SURVEY_SECTIONS:
        found = any(kw in text_lower for kw in sec["keywords"])
        if not found:
            issues.append({
                "category": "structure",
                "severity": "critical" if sec["name"] in ["Taxonomy / Categorization", "Comparative Analysis"] else "warning",
                "location": "LaTeX Document Structure",
                "title": f"Missing Core Section: {sec['name']}",
                "description": f"Survey papers require a dedicated {sec['name']} section to synthesize cross-paper patterns (e.g. \\section{{{sec['name']}}}).",
                "suggestion": f"Add a LaTeX section '\\section{{{sec['name']}}}' to organize the paper."
            })
    return issues

def check_citation_coverage(text: str) -> List[Dict[str, Any]]:
    issues = []
    sentences = re.split(r"(?<=[.!?])\s+", text)
    
    # Patterns indicating strong claims or empirical comparison
    claim_indicators = [
        r"\b(?:outperforms|surpasses|achieves|demonstrates superior|proves that|state-of-the-art|sota)\b",
        r"\b(?:studies have shown|researchers found|prior work shows|it has been established|experiments show)\b",
        r"\b(?:improves accuracy by|reduces latency by|\d+%\s+improvement)\b"
    ]

    for idx, sent in enumerate(sentences, 1):
        sent_clean = sent.strip()
        if len(sent_clean) < 25:
            continue

        # Check if sentence contains citation like [1], [1, 2], [Smith et al., 2024]
        has_citation = bool(re.search(r"\[(?:\d+|[A-Za-z]+(?:\s+et\s+al\.)?,?\s*\d{4})\]", sent_clean))

        if not has_citation:
            for pattern in claim_indicators:
                if re.search(pattern, sent_clean, re.IGNORECASE):
                    issues.append({
                        "category": "citation",
                        "severity": "critical",
                        "location": f"Sentence {idx}",
                        "title": "Unsubstantiated Empirical or Comparative Claim",
                        "description": f"The sentence makes an empirical claim ('{sent_clean[:90]}...') without citing a source paper.",
                        "suggestion": "Add a bracketed citation (e.g. [1] or [Author, Year]) backing up this claim."
                    })
                    break

    return issues

def check_logical_flow_and_style(text: str) -> List[Dict[str, Any]]:
    issues = []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    for p_idx, p in enumerate(paragraphs, 1):
        p_sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", p) if s.strip()]
        
        # 1. Check stub paragraphs (< 2 sentences)
        if len(p_sentences) == 1 and len(p.split()) < 30 and not p.startswith("#"):
            issues.append({
                "category": "flow",
                "severity": "suggestion",
                "location": f"Paragraph {p_idx}",
                "title": "Single-Sentence Stub Paragraph",
                "description": f"Paragraph {p_idx} contains only one short sentence. Academic writing favors developed paragraphs of 3-5 sentences.",
                "suggestion": "Expand this thought with supporting evidence or merge it with adjacent paragraphs."
            })

        # 2. Check overly long sentences (> 40 words)
        for s_idx, s in enumerate(p_sentences, 1):
            w_count = len(s.split())
            if w_count > 42:
                issues.append({
                    "category": "readability",
                    "severity": "warning",
                    "location": f"Paragraph {p_idx}, Sentence {s_idx}",
                    "title": f"Convoluted Sentence ({w_count} words)",
                    "description": f"Sentence is overly complex and impairs comprehension: '{s[:85]}...'",
                    "suggestion": "Split this into two concise sentences to improve academic clarity and flow."
                })

    return issues

def check_source_paper_overlap(draft_text: str, source_chunks: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Detects potential unintentional verbatim copying against the project's own uploaded papers.
    Uses 5-gram exact matching and sentence-level similarity.
    """
    issues = []
    draft_sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", draft_text) if len(s.strip()) > 35]

    def get_5grams(text: str) -> set:
        words = re.findall(r"\b[a-z0-9]+\b", text.lower())
        return set(" ".join(words[i:i+5]) for i in range(len(words)-4))

    matched_count = 0
    high_overlap_instances = []

    for s_idx, sent in enumerate(draft_sentences, 1):
        s_grams = get_5grams(sent)
        if not s_grams:
            continue

        best_overlap_ratio = 0.0
        best_source = None

        for chunk in source_chunks:
            c_grams = get_5grams(chunk["content"])
            if not c_grams:
                continue
            common = s_grams.intersection(c_grams)
            ratio = len(common) / len(s_grams)
            if ratio > best_overlap_ratio:
                best_overlap_ratio = ratio
                best_source = chunk

        if best_overlap_ratio >= 0.55:
            matched_count += 1
            src_paper = best_source.get("paper_title") or f"Paper #{best_source.get('paper_id')}"
            src_page = best_source.get("page_num", 1)
            high_overlap_instances.append({
                "sentence": sent,
                "overlap_pct": round(best_overlap_ratio * 100, 1),
                "source_paper": src_paper,
                "source_page": src_page
            })
            issues.append({
                "category": "overlap",
                "severity": "critical" if best_overlap_ratio > 0.75 else "warning",
                "location": f"Sentence {s_idx}",
                "title": f"High Verbatim Overlap with Source Paper ({round(best_overlap_ratio * 100)}%)",
                "description": f"Significant verbatim text overlap detected against '{src_paper}' (Page {src_page}): '{sent[:100]}...'",
                "suggestion": "Paraphrase this finding in your own words and explain its significance to maintain academic integrity."
            })

    total_checked = max(len(draft_sentences), 1)
    overall_overlap_pct = round((matched_count / total_checked) * 100, 1)

    overlap_summary = {
        "overall_overlap_pct": overall_overlap_pct,
        "flagged_sentence_count": matched_count,
        "total_sentences_audited": total_checked,
        "risk_level": "High" if overall_overlap_pct > 20 else ("Moderate" if overall_overlap_pct > 8 else "Clean")
    }

    return overlap_summary, issues

def audit_draft(draft_text: str, source_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Comprehensive multi-pass pedagogical audit:
    - Readability metrics
    - Structural completeness
    - Citation coverage
    - Logical flow & style
    - Source overlap
    """
    readability = compute_readability_metrics(draft_text)
    latex_syntax_issues = check_latex_syntax(draft_text)
    structural_issues = check_structural_completeness(draft_text)
    citation_issues = check_citation_coverage(draft_text)
    flow_issues = check_logical_flow_and_style(draft_text)
    overlap_summary, overlap_issues = check_source_paper_overlap(draft_text, source_chunks)

    all_issues = latex_syntax_issues + structural_issues + citation_issues + flow_issues + overlap_issues
    # Add unique id to each issue
    for i, issue in enumerate(all_issues, 1):
        issue["id"] = f"iss-{i}"
        issue["status"] = "open" # open | resolved | dismissed

    # Calculate overall health score (0 - 100)
    critical_count = sum(1 for x in all_issues if x["severity"] == "critical")
    warning_count = sum(1 for x in all_issues if x["severity"] == "warning")
    deductions = (critical_count * 12) + (warning_count * 4) + min(int(overlap_summary["overall_overlap_pct"]), 30)
    health_score = max(10, 100 - deductions)

    return {
        "readability": readability,
        "overlap": overlap_summary,
        "issues": all_issues,
        "health_score": health_score,
        "critical_count": critical_count,
        "warning_count": warning_count,
        "suggestion_count": len(all_issues) - critical_count - warning_count
    }
