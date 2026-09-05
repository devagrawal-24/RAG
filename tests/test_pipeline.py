import os
import sys
import json
import shutil

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import (
    init_db, create_project, get_project, add_paper, update_paper_metadata,
    get_paper, list_papers, save_chunks, get_project_chunks,
    get_outline, save_outline, get_summaries, save_summary,
    save_draft_review, list_draft_reviews, add_chat_message, get_chat_history
)
from backend.pdf_parser import parse_pdf, chunk_paper, calculate_sha256
from backend.rag_engine import HybridRetriever
from backend.outline_generator import generate_outline
from backend.summarizer import summarize_single_paper, synthesize_combined_summary
from backend.draft_reviewer import audit_draft

def test_full_pipeline():
    print("[1] Initializing Database...")
    init_db()

    print("[2] Creating Test Project...")
    proj = create_project("Survey on RAG Systems", "Retrieval-Augmented Generation for Academic Synthesis", "A test survey project")
    assert proj is not None
    proj_id = proj["id"]
    print(f"    Project Created: {proj['name']} (ID: {proj_id})")

    print("[3] Parsing and Ingesting abtract.pdf...")
    pdf_path = "abtract.pdf"
    assert os.path.exists(pdf_path)
    sha256 = calculate_sha256(pdf_path)
    paper_id = add_paper(proj_id, "abtract.pdf", "abtract.pdf", pdf_path, os.path.getsize(pdf_path), sha256)
    
    parsed = parse_pdf(pdf_path)
    update_paper_metadata(
        paper_id,
        title=parsed["title"],
        authors=parsed["authors"],
        abstract=parsed["abstract"],
        sections_json=parsed["sections"],
        page_count=parsed["page_count"],
        word_count=parsed["word_count"],
        status="ready"
    )
    chunks = chunk_paper(paper_id, proj_id, parsed)
    save_chunks(chunks)
    print(f"    Ingested paper '{parsed['title']}' with {len(chunks)} chunks across {parsed['page_count']} pages.")

    print("[4] Testing Hybrid RAG Retriever...")
    proj_chunks = get_project_chunks(proj_id)
    assert len(proj_chunks) > 0
    retriever = HybridRetriever(proj_chunks)
    query_res = retriever.query("retrieval augmented generation novice academic writers", top_k=2)
    assert len(query_res) > 0
    print(f"    RAG query returned {len(query_res)} chunks with top RRF score: {query_res[0]['rrf_score']:.4f}")
    print(f"    Top chunk source: Page {query_res[0]['page_num']} | Section {query_res[0]['section_title']}")

    print("[5] Generating Grounded Outline...")
    papers = list_papers(proj_id)
    sections = generate_outline(proj, papers, guidance="Emphasize comparative benchmarks")
    assert len(sections) >= 5
    saved_outline = save_outline(proj_id, sections, "Emphasize comparative benchmarks")
    print(f"    Generated Outline with {len(saved_outline['sections'])} sections (Version {saved_outline['version']}).")

    print("[6] Generating Paper & Combined Summaries...")
    single = summarize_single_paper(papers[0], proj_chunks)
    assert "problem" in single and "methodology" in single
    save_summary(proj_id, "individual", papers[0]["id"], **single)
    combined = synthesize_combined_summary(proj, papers, [{**single, "paper_id": papers[0]["id"]}])
    assert len(combined) > 100
    save_summary(proj_id, "combined", synthesis_content=combined)
    summaries = get_summaries(proj_id)
    print(f"    Saved {len(summaries)} summaries (Individual + Combined synthesis).")

    print("[7] Testing Pedagogical Draft Reviewer...")
    sample_draft = """
# Literature Review on Information Retrieval

Writing an academic survey or comprehensive literature review presents significant cognitive and pedagogical hurdles for early-career researchers. Novice scholars face intense cognitive overload when analyzing dozens of complex scientific papers.

Our proposed model outperforms all existing systems by 35% in accuracy. Researchers found that dense retrieval is always better than sparse retrieval.

This is a single sentence paragraph.

Consequently, while neural retrieval offers strong semantic matching, traditional lexical indexing with BM25 remains indispensable for exact keyword matching in scientific domains, especially when dealing with rare specialized technical terms and domain-specific acronyms that frequently occur in research publications across specialized disciplines.

## Conclusion and References
[1] Gao et al., 2024.
"""
    audit_res = audit_draft(sample_draft, proj_chunks)
    print(f"    Draft Health Score: {audit_res['health_score']}/100")
    print(f"    Readability: Flesch {audit_res['readability']['flesch_reading_ease']}, Fog {audit_res['readability']['gunning_fog']}")
    print(f"    Detected Issues: {len(audit_res['issues'])} (Critical: {audit_res['critical_count']}, Warnings: {audit_res['warning_count']})")
    print(f"    Source Overlap Detected: {audit_res['overlap']['overall_overlap_pct']}% ({audit_res['overlap']['risk_level']} risk)")
    
    # Verify uncited claim detected
    citation_issues = [i for i in audit_res["issues"] if i["category"] == "citation"]
    assert len(citation_issues) > 0, "Expected uncited claim warning"
    print(f"    Successfully flagged uncited claim: '{citation_issues[0]['title']}'")

    print("\nALL BACKEND PIPELINE TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    test_full_pipeline()
