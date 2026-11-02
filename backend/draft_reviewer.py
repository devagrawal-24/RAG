import re
import math
from typing import Dict, List, Any, Tuple, Optional

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

def compute_sam_metrics(
    draft_text: str,
    source_chunks: List[Dict[str, Any]],
    papers: Optional[List[Dict[str, Any]]] = None,
    outline: Optional[Dict[str, Any]] = None,
    readability: Optional[Dict[str, Any]] = None,
    citation_issues: Optional[List[Dict[str, Any]]] = None,
    structural_issues: Optional[List[Dict[str, Any]]] = None
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Computes SurveyBench SAM (Survey Assessment Metrics):
    - SAM-R: Reference & Citation Quality (corpus coverage, citation density, claim grounding)
    - SAM-O: Outline & Taxonomic Structure (6 core survey pillars, hierarchy depth, section balance)
    - SAM-C: Content & Synthesis Quality (multi-paper cross-comparison ratio, comparative tables, graduate readability)
    """
    sam_issues = []

    # ---------- 1. SAM-R: Reference & Provenance Quality ----------
    latex_cites = re.findall(r"\\cite[a-z]*\{([^}]+)\}", draft_text)
    cited_keys = []
    for c in latex_cites:
        for k in c.split(","):
            k_clean = k.strip()
            if k_clean:
                cited_keys.append(k_clean)

    bracket_cites = re.findall(r"\[([0-9,\s\-]+)\]", draft_text)
    author_cites = re.findall(r"\[([A-Za-z]+(?:\s+et\s+al\.)?,?\s*\d{4})\]", draft_text)

    total_citations = len(cited_keys) + len(bracket_cites) + len(author_cites)

    corpus_papers = list(papers) if papers else []
    if not corpus_papers and source_chunks:
        chunk_paper_ids = set()
        for c in source_chunks:
            pid = c.get("paper_id")
            if pid and pid not in chunk_paper_ids:
                chunk_paper_ids.add(pid)
                corpus_papers.append({"id": pid, "title": c.get("paper_title") or ""})

    total_corpus_papers = len(corpus_papers)

    draft_lower = draft_text.lower()
    matched_papers_count = 0
    if total_corpus_papers > 0:
        for p in corpus_papers:
            pid = str(p.get("id", "")).lower()
            title = str(p.get("title", "")).lower()
            authors = str(p.get("authors", "")).lower()
            matched = False
            if pid and (pid in draft_lower or any(pid in k.lower() for k in cited_keys)):
                matched = True
            elif title and len(title) > 6 and title[:24] in draft_lower:
                matched = True
            elif authors:
                first_author = authors.split(",")[0].split()[0] if authors else ""
                if first_author and len(first_author) > 3 and first_author in draft_lower:
                    matched = True
            if matched:
                matched_papers_count += 1
        if matched_papers_count == 0 and total_citations > 0:
            matched_papers_count = min(total_citations, total_corpus_papers)

        coverage_pct = round((matched_papers_count / max(total_corpus_papers, 1)) * 100, 1)
    else:
        coverage_pct = 100.0

    prose_words = readability.get("total_words", 0) if readability else len(re.findall(r"\b\w+\b", strip_latex_commands(draft_text)))
    citation_density = round((total_citations / max(prose_words, 1)) * 1000, 1) if prose_words > 0 else 0.0
    uncited_claim_count = len(citation_issues) if citation_issues else 0

    r_score = 100.0
    if total_corpus_papers > 1 and coverage_pct < 70.0:
        r_score -= (70.0 - coverage_pct) * 0.7
    if citation_density < 14.0:
        r_score -= (14.0 - citation_density) * 2.5
    elif citation_density > 65.0:
        r_score -= 8.0
    r_score -= (uncited_claim_count * 8.0)
    sam_r_score = max(15, min(100, round(r_score)))

    if coverage_pct < 60.0 and total_corpus_papers > 1:
        sam_issues.append({
            "category": "citation",
            "severity": "warning",
            "location": "Literature Citation Provenance",
            "title": f"Low Corpus Coverage (SAM-R: {coverage_pct}%)",
            "description": f"Only {matched_papers_count} of your {total_corpus_papers} ingested papers are cited. SurveyBench standards require comprehensive literature coverage.",
            "suggestion": "Incorporate and cite the remaining uploaded papers to support your taxonomy arguments."
        })

    # ---------- 2. SAM-O: Outline & Structure Quality ----------
    pillars_found = []
    text_lower = draft_text.lower()
    for sec in REQUIRED_SURVEY_SECTIONS:
        if any(kw in text_lower for kw in sec["keywords"]):
            pillars_found.append(sec["name"])

    pillar_count = len(pillars_found)
    has_subsections = bool(re.search(r"\\subsection\b|###\s+", draft_text))
    has_subsubsections = bool(re.search(r"\\subsubsection\b|####\s+", draft_text))

    if has_subsubsections:
        depth_label = "Deep (3+ Levels)"
        depth_score = 100
    elif has_subsections:
        depth_label = "Hierarchical (2 Levels)"
        depth_score = 88
    else:
        depth_label = "Flat (1 Level)"
        depth_score = 55

    o_score = (pillar_count / 6.0) * 75.0 + (depth_score * 0.25)
    sam_o_score = max(20, min(100, round(o_score)))

    if not has_subsections and len(draft_text) > 800:
        sam_issues.append({
            "category": "structure",
            "severity": "suggestion",
            "location": "Section Hierarchy",
            "title": "Flat Section Hierarchy (SAM-O)",
            "description": "Your draft uses only top-level sections. Standard survey papers use subsections (\\subsection{}) to categorize algorithmic paradigms.",
            "suggestion": "Divide broad sections into distinct subsections to improve taxonomy granularity."
        })

    # ---------- 3. SAM-C: Content & Comparative Synthesis Quality ----------
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", draft_text) if len(s.strip()) > 20]
    comparative_sentences = 0
    for s in sentences:
        s_low = s.lower()
        has_multi_cite = (len(re.findall(r"\\cite[a-z]*\{([^}]+)\}", s)) > 1) or bool(re.search(r"\\cite[a-z]*\{[^,]+,[^}]+\}", s)) or (len(re.findall(r"\[\d+\]", s)) > 1)
        has_comp_word = any(kw in s_low for kw in [
            "in contrast", "whereas", "unlike", "compared to", "in comparison",
            "outperforms", "surpasses", "trade-off", "diverges from", "differs from",
            "similarly", "on the other hand", "superior to", "conversely", "relative to"
        ])
        if has_multi_cite or has_comp_word:
            comparative_sentences += 1

    has_table = ("\\begin{table}" in draft_text) or ("\\begin{tabular}" in draft_text) or bool(re.search(r"\|(?:\s*[-:]+\s*\|)+", draft_text))

    fre = readability.get("flesch_reading_ease", 50) if readability else 50
    fog = readability.get("gunning_fog", 14) if readability else 14
    readability_bonus = 15 if (30 <= fre <= 65 and 11 <= fog <= 19) else 5

    c_score = 45.0 + min(comparative_sentences * 5.0, 30.0) + (15.0 if has_table else 0.0) + readability_bonus

    stub_count = sum(1 for p in draft_text.split("\n\n") if len(re.split(r"(?<=[.!?])\s+", p.strip())) == 1 and len(p.split()) < 30 and not p.strip().startswith("#"))
    c_score -= (stub_count * 3.0)
    if not has_table:
        c_score -= 8.0

    sam_c_score = max(15, min(100, round(c_score)))

    if not has_table and len(draft_text) > 1000:
        sam_issues.append({
            "category": "flow",
            "severity": "suggestion",
            "location": "Comparative Taxonomy Table",
            "title": "Missing Taxonomy / Benchmark Table (SAM-C)",
            "description": "Survey papers in SurveyBench are expected to synthesize comparative algorithm dimensions in a summary table (\\begin{table}).",
            "suggestion": "Add an IEEE style comparison table comparing methodologies across accuracy, latency, and corpus scale."
        })

    if comparative_sentences < 2 and len(sentences) >= 8:
        sam_issues.append({
            "category": "flow",
            "severity": "warning",
            "location": "Cross-Paper Synthesis",
            "title": "Isolated Literature Reporting (SAM-C)",
            "description": "Your draft reports literature sequentially without cross-paper comparison. Survey synthesis requires linking multiple papers together.",
            "suggestion": "Synthesize multiple papers in the same paragraph using comparative language (e.g., 'In contrast to [1], [2] proposes...')."
        })

    # ---------- Composite SAM Benchmark ----------
    composite = round((0.35 * sam_r_score) + (0.30 * sam_o_score) + (0.35 * sam_c_score))
    if composite >= 85:
        tier = "S-Tier (Publication Ready)"
    elif composite >= 70:
        tier = "A-Tier (Strong Survey Draft)"
    elif composite >= 55:
        tier = "B-Tier (Promising Synthesis)"
    else:
        tier = "C-Tier (Preliminary Draft)"

    sam_summary = {
        "composite": composite,
        "tier": tier,
        "sam_r": {
            "score": sam_r_score,
            "total_citations": total_citations,
            "citation_density": citation_density,
            "corpus_paper_count": total_corpus_papers,
            "cited_paper_count": matched_papers_count,
            "coverage_pct": coverage_pct,
            "uncited_claims": uncited_claim_count
        },
        "sam_o": {
            "score": sam_o_score,
            "pillars_count": pillar_count,
            "pillars_total": 6,
            "pillars_found": pillars_found,
            "hierarchy_depth": depth_label
        },
        "sam_c": {
            "score": sam_c_score,
            "comparative_links": comparative_sentences,
            "has_table": has_table,
            "table_status": "Present" if has_table else "Missing (Table Expected)"
        }
    }

    return sam_summary, sam_issues


def audit_draft(
    draft_text: str,
    source_chunks: List[Dict[str, Any]],
    papers: Optional[List[Dict[str, Any]]] = None,
    outline: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Comprehensive multi-pass pedagogical audit with SurveyBench SAM evaluation:
    - Readability metrics (FRE, Fog)
    - Structural completeness & hierarchy
    - Citation coverage & claim provenance
    - Logical flow & style
    - Source overlap & academic integrity
    - SAM: SAM-R (Reference), SAM-O (Outline), SAM-C (Content Synthesis)
    """
    readability = compute_readability_metrics(draft_text)
    latex_syntax_issues = check_latex_syntax(draft_text)
    structural_issues = check_structural_completeness(draft_text)
    citation_issues = check_citation_coverage(draft_text)
    flow_issues = check_logical_flow_and_style(draft_text)
    overlap_summary, overlap_issues = check_source_paper_overlap(draft_text, source_chunks)

    sam_summary, sam_issues = compute_sam_metrics(
        draft_text=draft_text,
        source_chunks=source_chunks,
        papers=papers,
        outline=outline,
        readability=readability,
        citation_issues=citation_issues,
        structural_issues=structural_issues
    )

    all_issues = latex_syntax_issues + structural_issues + citation_issues + flow_issues + overlap_issues + sam_issues
    # Add unique id to each issue
    for i, issue in enumerate(all_issues, 1):
        issue["id"] = f"iss-{i}"
        issue["status"] = "open"  # open | resolved | dismissed

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
        "sam": sam_summary,
        "critical_count": critical_count,
        "warning_count": warning_count,
        "suggestion_count": len(all_issues) - critical_count - warning_count
    }
