import os
import shutil
import uuid
from dotenv import load_dotenv
load_dotenv()
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel

from backend.database import (
    init_db, list_projects, create_project, get_project, update_project, delete_project,
    add_paper, update_paper_metadata, get_paper, list_papers, delete_paper,
    search_papers_for_project, find_papers_by_mentions,
    find_duplicate_paper, save_chunks, get_project_chunks,
    get_outline, save_outline, get_summaries, save_summary,
    save_draft_review, get_draft_review, list_draft_reviews,
    save_project_draft, get_project_draft,
    add_chat_message, get_chat_history, clear_chat_history,
    get_all_settings, set_setting, UPLOAD_DIR
)
from backend.pdf_parser import parse_pdf, chunk_paper
from backend.rag_engine import HybridRetriever
from backend.outline_generator import generate_outline
from backend.summarizer import summarize_single_paper, synthesize_combined_summary
from backend.draft_reviewer import audit_draft
from backend.llm_client import LLMClient

# Initialize database
init_db()

app = FastAPI(
    title="Survey Paper Assistant API",
    description="Retrieval-Augmented Generation (RAG) Framework for First-Time Academic Writers",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Background worker for paper ingestion
def process_paper_ingestion(paper_id: str, project_id: str, file_path: str):
    try:
        update_paper_metadata(paper_id, status="processing")
        parsed = parse_pdf(file_path)
        
        # Save extracted metadata
        update_paper_metadata(
            paper_id,
            title=parsed["title"],
            authors=parsed["authors"],
            abstract=parsed["abstract"],
            sections_json=parsed["sections"],
            page_count=parsed["page_count"],
            word_count=parsed["word_count"],
            status="ready",
            error_message="; ".join(parsed["warnings"]) if parsed["warnings"] else None
        )
        
        # Chunk paper and save to db
        chunks = chunk_paper(paper_id, project_id, parsed)
        save_chunks(chunks)

    except Exception as e:
        update_paper_metadata(paper_id, status="failed", error_message=str(e))

# Pydantic Schemas
class ProjectCreateReq(BaseModel):
    name: str
    topic: Optional[str] = ""
    description: Optional[str] = ""

class ProjectUpdateReq(BaseModel):
    name: str
    topic: Optional[str] = ""
    description: Optional[str] = ""

class PaperUpdateReq(BaseModel):
    title: Optional[str] = None
    authors: Optional[str] = None
    abstract: Optional[str] = None

class OutlineGenerateReq(BaseModel):
    guidance: Optional[str] = ""

class OutlineSaveReq(BaseModel):
    sections: List[Dict[str, Any]]
    guidance: Optional[str] = ""

class DraftReviewReq(BaseModel):
    draft_title: Optional[str] = "Survey Paper Draft"
    draft_text: str

class ProjectDraftReq(BaseModel):
    title: Optional[str] = "Survey Paper Draft"
    content: str

class ChatReq(BaseModel):
    message: str

# ----------------- Projects Endpoints -----------------
@app.get("/api/projects")
def api_list_projects():
    return list_projects()

@app.post("/api/projects")
def api_create_project(req: ProjectCreateReq):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Project name is required")
    return create_project(req.name.strip(), req.topic.strip(), req.description.strip())

@app.get("/api/projects/{project_id}")
def api_get_project(project_id: str):
    p = get_project(project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p

@app.put("/api/projects/{project_id}")
def api_update_project(project_id: str, req: ProjectUpdateReq):
    p = update_project(project_id, req.name.strip(), req.topic.strip(), req.description.strip())
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p

@app.delete("/api/projects/{project_id}")
def api_delete_project(project_id: str):
    delete_project(project_id)
    return {"status": "success", "message": "Project deleted"}

# ----------------- Papers Endpoints -----------------
@app.get("/api/projects/{project_id}/papers")
def api_list_papers(project_id: str):
    return list_papers(project_id)

@app.get("/api/projects/{project_id}/papers/search")
def api_search_papers(project_id: str, q: str = ""):
    return search_papers_for_project(project_id, q)

@app.post("/api/projects/{project_id}/papers")
async def api_upload_papers(project_id: str, background_tasks: BackgroundTasks, files: List[UploadFile] = File(...)):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    uploaded = []
    for file in files:
        # Edge Case E1: Reject non-PDFs
        if not file.filename.lower().endswith(".pdf"):
            uploaded.append({
                "original_name": file.filename,
                "status": "failed",
                "error": "Only PDF files are supported for paper ingestion."
            })
            continue

        filename = f"{uuid.uuid4()}_{file.filename}"
        save_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(save_path)
        from backend.pdf_parser import calculate_sha256
        sha256 = calculate_sha256(save_path)

        # Edge Case E7: Duplicate paper detection
        dup = find_duplicate_paper(project_id, sha256)
        if dup:
            os.remove(save_path)
            uploaded.append({
                "original_name": file.filename,
                "status": "duplicate",
                "error": f"Duplicate paper detected: already uploaded as '{dup['original_name']}'."
            })
            continue

        paper_id = add_paper(
            project_id=project_id,
            filename=filename,
            original_name=file.filename,
            file_path=save_path,
            file_size=file_size,
            sha256=sha256
        )

        background_tasks.add_task(process_paper_ingestion, paper_id, project_id, save_path)
        uploaded.append({
            "id": paper_id,
            "original_name": file.filename,
            "status": "queued"
        })

    return {"uploaded": uploaded}

@app.get("/api/papers/{paper_id}")
def api_get_paper(paper_id: str):
    p = get_paper(paper_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paper not found")
    return p

@app.put("/api/papers/{paper_id}")
def api_update_paper(paper_id: str, req: PaperUpdateReq):
    updates = {}
    if req.title is not None:
        updates["title"] = req.title.strip()
    if req.authors is not None:
        updates["authors"] = req.authors.strip()
    if req.abstract is not None:
        updates["abstract"] = req.abstract.strip()
    update_paper_metadata(paper_id, **updates)
    return get_paper(paper_id)

@app.delete("/api/papers/{paper_id}")
def api_delete_paper(paper_id: str):
    delete_paper(paper_id)
    return {"status": "success", "message": "Paper removed"}

# ----------------- Outline Endpoints -----------------
@app.get("/api/projects/{project_id}/outline")
def api_get_outline(project_id: str):
    out = get_outline(project_id)
    if not out:
        return {"sections": [], "version": 0}
    return out

@app.post("/api/projects/{project_id}/outline/generate")
def api_generate_outline(project_id: str, req: OutlineGenerateReq):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    papers = list_papers(project_id)
    settings = get_all_settings()

    sections = generate_outline(project, papers, req.guidance or "", settings)
    saved = save_outline(project_id, sections, req.guidance or "")
    return saved

@app.put("/api/projects/{project_id}/outline")
def api_save_outline(project_id: str, req: OutlineSaveReq):
    saved = save_outline(project_id, req.sections, req.guidance or "")
    return saved

# ----------------- Summaries Endpoints -----------------
@app.get("/api/projects/{project_id}/summaries")
def api_get_summaries(project_id: str):
    return get_summaries(project_id)

@app.post("/api/projects/{project_id}/summaries/generate")
def api_generate_summaries(project_id: str):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    papers = list_papers(project_id)
    if not papers:
        raise HTTPException(status_code=400, detail="Please upload at least one paper before generating summaries.")

    all_chunks = get_project_chunks(project_id)
    settings = get_all_settings()

    individual_summaries = []
    for p in papers:
        p_chunks = [c for c in all_chunks if c["paper_id"] == p["id"]]
        single = summarize_single_paper(p, p_chunks, settings=settings)
        save_summary(
            project_id=project_id,
            paper_id=p["id"],
            summary_type="individual",
            problem=single.get("problem", ""),
            methodology=single.get("methodology", ""),
            findings=single.get("findings", ""),
            limitations=single.get("limitations", "")
        )
        individual_summaries.append({**single, "paper_id": p["id"]})

    # Generate Combined Synthesis
    synthesis = synthesize_combined_summary(project, papers, individual_summaries, settings=settings)
    save_summary(
        project_id=project_id,
        summary_type="combined",
        synthesis_content=synthesis
    )

    return get_summaries(project_id)

# ----------------- Draft Review Endpoints -----------------
@app.post("/api/projects/{project_id}/review")
async def api_audit_draft(
    project_id: str,
    draft_title: Optional[str] = Form("Survey Draft"),
    draft_text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    extracted_draft = ""
    if file:
        filename = file.filename.lower()
        if filename.endswith(".pdf"):
            temp_path = os.path.join(UPLOAD_DIR, f"draft_{uuid.uuid4()}.pdf")
            with open(temp_path, "wb") as buf:
                shutil.copyfileobj(file.file, buf)
            parsed = parse_pdf(temp_path)
            extracted_draft = "\n\n".join([p["text"] for p in parsed["pages"]])
            os.remove(temp_path)
        elif filename.endswith(".docx"):
            import docx
            temp_path = os.path.join(UPLOAD_DIR, f"draft_{uuid.uuid4()}.docx")
            with open(temp_path, "wb") as buf:
                shutil.copyfileobj(file.file, buf)
            doc = docx.Document(temp_path)
            extracted_draft = "\n\n".join([p.text for p in doc.paragraphs if p.text.strip()])
            os.remove(temp_path)
        else: # txt or md
            content_bytes = await file.read()
            extracted_draft = content_bytes.decode("utf-8", errors="ignore")

    elif draft_text:
        extracted_draft = draft_text.strip()

    # Edge Case E12: Empty or near-empty draft
    if not extracted_draft or len(extracted_draft.split()) < 20:
        raise HTTPException(status_code=400, detail="Insufficient content to review. Please submit at least a few paragraphs (min 20 words).")

    source_chunks = get_project_chunks(project_id)
    audit_results = audit_draft(extracted_draft, source_chunks)

    saved = save_draft_review(
        project_id=project_id,
        draft_title=draft_title or "Draft Review",
        draft_text=extracted_draft,
        readability=audit_results["readability"],
        issues=audit_results["issues"],
        overlap=audit_results["overlap"]
    )
    return {**saved, "health_score": audit_results["health_score"]}

@app.get("/api/projects/{project_id}/reviews")
def api_list_draft_reviews(project_id: str):
    return list_draft_reviews(project_id)

@app.get("/api/reviews/{review_id}")
def api_get_draft_review(review_id: str):
    rev = get_draft_review(review_id)
    if not rev:
        raise HTTPException(status_code=404, detail="Review not found")
    return rev

# ----------------- In-App Draft Studio Endpoints -----------------
@app.get("/api/projects/{project_id}/draft")
def api_get_project_draft(project_id: str):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    draft = get_project_draft(project_id)
    # If empty, pre-populate with structured skeleton based on outline and project details
    if not draft.get("content"):
        outline = get_outline(project_id)
        sections = outline.get("sections", []) if outline else []
        skeleton_parts = [
            f"# {project.get('name', 'Survey Paper')}",
            f"\n*Topic: {project.get('topic', 'Academic Literature Review')}*\n",
            "## Abstract\nThis paper synthesizes current advancements and methodological trade-offs across recent scientific literature.\n"
        ]
        if sections:
            for sec in sections:
                citations_str = ", ".join(sec.get("suggested_citations", []))
                cit_note = f"\n*Suggested Literature: {citations_str}*\n" if citations_str else ""
                skeleton_parts.append(
                    f"\n## {sec.get('number', '')} {sec.get('title', 'Section')}\n{sec.get('description', '')}\n{cit_note}\n<!-- Synthesize claims and compare methodologies here -->\n"
                )
        else:
            skeleton_parts.append(
                "\n## 1. Introduction & Problem Formulation\nSynthesize the central research challenges and motivational gaps across the literature.\n\n"
                "## 2. Taxonomy & Methodological Comparison\nClassify existing paradigms into a cohesive comparative taxonomy.\n\n"
                "## 3. Empirical Findings & Benchmarks\nAnalyze published results, trade-offs, and experimental validation.\n\n"
                "## 4. Open Challenges & Future Directions\nHighlight unresolved questions and emerging avenues for inquiry.\n\n"
                "## 5. Conclusion\nSummarize the overarching synthesis and principal takeaways.\n"
            )
        draft["content"] = "\n".join(skeleton_parts)
    return draft

@app.put("/api/projects/{project_id}/draft")
def api_save_project_draft(project_id: str, req: ProjectDraftReq):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return save_project_draft(project_id, req.title or "Survey Paper Draft", req.content)

# ----------------- Project Co-Pilot Chat Endpoints -----------------
@app.get("/api/projects/{project_id}/chat")
def api_get_chat(project_id: str):
    return get_chat_history(project_id)

@app.post("/api/projects/{project_id}/chat")
def api_chat(project_id: str, req: ChatReq):
    user_msg = req.message.strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Add user message to history
    add_chat_message(project_id, "user", user_msg)

    # 1. Check for @-Mention Document References
    import re
    has_mention_trigger = "@" in user_msg
    referenced_papers = []

    if has_mention_trigger:
        bracket_mentions = re.findall(r'@\[([^\]]+)\]', user_msg)
        word_mentions = re.findall(r'@([a-zA-Z0-9_\-\.\:\s]{2,})', user_msg)
        all_mention_terms = bracket_mentions + word_mentions

        if all_mention_terms:
            referenced_papers = find_papers_by_mentions(project_id, all_mention_terms)

        if not referenced_papers:
            # Fallback search for text following @
            raw_queries = re.findall(r'@([^\n,;!\?]+)', user_msg)
            for rq in raw_queries:
                clean_q = rq.strip()
                if clean_q:
                    matched_search = search_papers_for_project(project_id, clean_q)
                    for m in matched_search:
                        if not any(p["id"] == m["id"] for p in referenced_papers):
                            referenced_papers.append(m)

    # 2. Retrieve relevant chunks using Hybrid RAG
    chunks = get_project_chunks(project_id)
    retriever = HybridRetriever(chunks)
    retrieved_chunks = retriever.query(user_msg, top_k=5)

    # If papers were explicitly @-mentioned, ensure their chunks are retrieved as well
    if referenced_papers:
        ref_paper_ids = {p["id"] for p in referenced_papers}
        specific_chunks = [c for c in chunks if c.get("paper_id") in ref_paper_ids]
        # Prepend specific paper chunks
        retrieved_chunks = specific_chunks[:4] + [c for c in retrieved_chunks if c.get("paper_id") not in ref_paper_ids][:3]

    # 3. Out-of-scope detection
    WRITING_ASSIST_KEYWORDS = {
        "synonym", "synonyms", "antonym", "antonyms",
        "rephrase", "rephrasing", "rewrite", "reword",
        "paraphrase", "paraphrasing",
        "grammar", "grammatical", "proofread", "proofreading",
        "sentence", "paragraph", "reformat", "restructure",
        "formal", "informal", "academic tone", "tone",
        "clarity", "concise", "shorten", "expand", "elaborate",
        "transition", "cohesion", "coherence",
        "vocabulary", "word choice", "diction",
        "passive voice", "active voice",
        "citation format", "reference style", "apa", "mla", "ieee",
        "heading", "title suggestion",
    }

    msg_lower = user_msg.lower()
    is_writing_assist = any(kw in msg_lower for kw in WRITING_ASSIST_KEYWORDS)

    OUT_OF_SCOPE_MSG = (
        "Thank you for your question! However, it appears to be outside the scope of the "
        "papers and materials uploaded to this project. I can only assist with questions "
        "related to the literature in your project workspace.\n\n"
        "Here are some things I *can* help you with:\n"
        "- Summarizing and comparing the uploaded papers\n"
        "- Explaining methodologies discussed in your literature\n"
        "- Helping you draft and structure your survey sections\n"
        "- Identifying research gaps across your sources\n"
        "- Rephrasing sentences, suggesting synonyms, and improving academic tone\n\n"
        "Please try rephrasing your question to relate it to your project's topic, "
        "or upload additional relevant papers to expand the knowledge base."
    )

    is_out_of_scope = False

    if not chunks:
        if not is_writing_assist and not has_mention_trigger:
            is_out_of_scope = True
            OUT_OF_SCOPE_MSG = (
                "It looks like there are no papers uploaded to this project yet, so I don't "
                "have any source material to draw from. Please upload one or more research "
                "papers first, and then I'll be happy to help you explore and synthesize them!"
            )
    elif retrieved_chunks and not is_writing_assist and not has_mention_trigger:
        top_chunk = retrieved_chunks[0]
        top_rrf = top_chunk.get("rrf_score", 0)
        top_bm25 = top_chunk.get("bm25_score", 0)
        top_dense = top_chunk.get("dense_score", 0)

        # Require meaningful lexical (BM25 >= 1.2) or semantic (dense_score >= 0.12) overlap
        if top_bm25 < 1.2 and top_dense < 0.12 and top_rrf < 0.025:
            is_out_of_scope = True

    if is_out_of_scope:
        assistant_msg = add_chat_message(project_id, "assistant", OUT_OF_SCOPE_MSG, [])
        return assistant_msg

    # Format citations
    citations = []
    context_blocks = []

    # Inject Explicit @-Mention Document Metadata if present
    mention_context_str = ""
    if referenced_papers:
        ref_blocks = []
        for p in referenced_papers:
            ref_blocks.append(
                f"DOCUMENT ID: {p['id']}\n"
                f"TITLE: {p.get('title') or p.get('original_name')}\n"
                f"AUTHORS: {p.get('authors') or 'Unknown Authors'}\n"
                f"ABSTRACT: {p.get('abstract') or 'No abstract provided'}\n"
                f"KEY FINDINGS: {p.get('key_findings') or 'N/A'}"
            )
            citations.append({
                "paper_id": p['id'],
                "paper_title": p.get('title') or p.get('original_name'),
                "page_num": 1,
                "section_title": "Abstract / Referenced Metadata",
                "snippet": (p.get('abstract') or p.get('key_findings') or "")[:280]
            })
        mention_context_str = "EXPLICITLY REFERENCED PAPERS VIA @-MENTION:\n" + "\n---\n".join(ref_blocks)

    for c in retrieved_chunks:
        cit = {
            "paper_id": c.get("paper_id"),
            "paper_title": c.get("paper_title") or c.get("original_name") or "Source Paper",
            "page_num": c.get("page_num", 1),
            "section_title": c.get("section_title", "General"),
            "snippet": c.get("content", "")[:280] + "..."
        }
        if not any(existing["paper_id"] == cit["paper_id"] and existing["snippet"] == cit["snippet"] for existing in citations):
            citations.append(cit)
        context_blocks.append(f"[{cit['paper_title']} | Page {cit['page_num']} | Section {cit['section_title']}]:\n{c.get('content')}")

    context_str = "\n\n---\n\n".join(context_blocks) if context_blocks else "No relevant source passages found."

    outline = get_outline(project_id)
    outline_context = f"Project Outline has {len(outline['sections'])} sections." if outline and outline.get("sections") else "No outline generated yet."

    topic_str = project.get('topic') or project.get('name') or 'Academic Survey'

    # System Prompt with Strict Scope Boundaries & Document Reference Handler (@-Trigger) Rules
    system_prompt = (
        "You are the Survey Paper Assistant Co-Pilot, an expert academic writing advisor. "
        f"You are strictly scoped to this student's research project on '{topic_str}'.\n\n"
        "STRICT MANDATORY SCOPE BOUNDARIES:\n"
        "1. EXCLUSIVELY LITERATURE & ACADEMIC WRITING: You must ONLY answer questions directly related to the provided research papers, project topic, or academic writing assistance (e.g. suggesting synonyms, rephrasing sentences, paraphrasing, improving grammar, adjusting academic tone, structuring survey sections, or formatting citations).\n"
        "2. REFUSE OFF-TOPIC & GENERAL TRIVIA: If the user asks about general knowledge, recipes, sports, pop culture, general coding/scripting, personal advice, or anything unrelated to their project literature and academic writing, YOU MUST REFUSE TO ANSWER.\n"
        f"   Mandatory Refusal Format: 'I am strictly scoped to assist with your research project on \"{topic_str}\" and academic writing. I cannot answer off-topic or general knowledge questions.'\n"
        "3. DOCUMENT REFERENCE HANDLER (@-TRIGGER):\n"
        "   - When the user references papers via '@' (e.g. '@papername'), ground your response in the referenced paper metadata.\n"
        "   - MULTI-PAPER REFERENCE: Synthesize and compare findings across ALL referenced papers.\n"
        "4. TONE & CONSTRAINTS: Keep responses concise, academic, and directly tied to the text, abstracts, or findings of the referenced papers. Do NOT hallucinate paper details, authors, or findings that are not present in the database snippets provided."
    )

    full_prompt_parts = [
        f"Project: '{project.get('name')}' (Topic: '{project.get('topic')}')",
        f"Outline Status: {outline_context}"
    ]

    if mention_context_str:
        full_prompt_parts.append(mention_context_str)

    full_prompt_parts.append(f"Relevant Literature Passages:\n{context_str}")
    full_prompt_parts.append(f"Student's Question: {user_msg}")

    full_prompt = "\n\n".join(full_prompt_parts)

    settings = get_all_settings()
    client = LLMClient(settings)
    
    # Generate response
    response_content = client.generate([{"role": "user", "content": full_prompt}], system_prompt)

    assistant_msg = add_chat_message(project_id, "assistant", response_content, citations)
    return assistant_msg

@app.delete("/api/projects/{project_id}/chat")
def api_clear_chat(project_id: str):
    clear_chat_history(project_id)
    return {"status": "success", "message": "Chat history cleared"}

# ----------------- Export Endpoints -----------------
@app.get("/api/projects/{project_id}/export")
def api_export_project(project_id: str, format: str = "markdown"):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    papers = list_papers(project_id)
    outline = get_outline(project_id)
    summaries = get_summaries(project_id)
    reviews = list_draft_reviews(project_id)

    # Assemble comprehensive survey kit in Markdown
    md_lines = [
        f"# Survey Paper Starter Dossier: {project.get('name')}",
        f"**Topic:** {project.get('topic') or 'General Survey'}",
        f"**Generated on:** {project.get('updated_at')}",
        f"**Ingested Papers:** {len(papers)} papers",
        "",
        "---",
        "",
        "## 1. Survey Paper Structured Outline",
    ]

    if outline and outline.get("sections"):
        for sec in outline["sections"]:
            cites = ", ".join(sec.get("suggested_citations", []))
            cites_str = f" *(Citations: {cites})*" if cites else ""
            md_lines.append(f"### {sec.get('number', '')} {sec.get('title', '')}{cites_str}")
            md_lines.append(f"{sec.get('description', '')}\n")
    else:
        md_lines.append("*No outline generated yet.*\n")

    md_lines.append("---")
    md_lines.append("## 2. Multi-Paper Synthesized Literature Review")
    
    comb = next((s for s in summaries if s.get("summary_type") == "combined"), None)
    if comb and comb.get("synthesis_content"):
        md_lines.append(comb["synthesis_content"])
    else:
        md_lines.append("*No combined synthesis generated yet.*")

    md_lines.append("\n---")
    md_lines.append("## 3. Individual Paper Decomposition & Analysis")

    ind_summaries = [s for s in summaries if s.get("summary_type") == "individual"]
    for s in ind_summaries:
        md_lines.append(f"### {s.get('paper_title') or 'Paper'}")
        md_lines.append(f"- **Problem Statement:** {s.get('problem', 'N/A')}")
        md_lines.append(f"- **Methodology:** {s.get('methodology', 'N/A')}")
        md_lines.append(f"- **Key Findings:** {s.get('findings', 'N/A')}")
        md_lines.append(f"- **Limitations:** {s.get('limitations', 'N/A')}\n")

    if reviews:
        latest_rev = reviews[0]
        md_lines.append("---")
        md_lines.append(f"## 4. Latest Draft Diagnostic Audit (Version {latest_rev['version']})")
        readability = latest_rev.get("readability", {})
        md_lines.append(f"- **Flesch Reading Ease:** {readability.get('flesch_reading_ease')} ({readability.get('grade_level')})")
        md_lines.append(f"- **Gunning Fog Index:** {readability.get('gunning_fog')}")
        md_lines.append(f"- **Average Sentence Length:** {readability.get('avg_sentence_length')} words")
        md_lines.append(f"- **Source Overlap Risk:** {latest_rev.get('overlap', {}).get('risk_level', 'Clean')} ({latest_rev.get('overlap', {}).get('overall_overlap_pct', 0)}%)")
        md_lines.append("\n**Key Diagnostic Feedback:**")
        for iss in latest_rev.get("issues", [])[:5]:
            md_lines.append(f"- **[{iss.get('severity', '').upper()}] {iss.get('title')}:** {iss.get('description')} *Suggested fix: {iss.get('suggestion')}*")

    md_content = "\n".join(md_lines)

    if format == "markdown" or format == "md":
        return PlainTextResponse(md_content, media_type="text/markdown", headers={
            "Content-Disposition": f"attachment; filename=survey_dossier_{project['id'][:8]}.md"
        })
    else:
        # Simple HTML export
        html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{project.get('name')} - Survey Dossier</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 860px; margin: 40px auto; padding: 0 20px; color: #1e293b; }}
h1, h2, h3 {{ color: #0f172a; }}
pre {{ background: #f1f5f9; padding: 15px; border-radius: 8px; white-space: pre-wrap; }}
hr {{ border: none; border-top: 1px solid #e2e8f0; margin: 30px 0; }}
</style>
</head>
<body>
<pre>{md_content}</pre>
</body>
</html>"""
        return PlainTextResponse(html_content, media_type="text/html", headers={
            "Content-Disposition": f"attachment; filename=survey_dossier_{project['id'][:8]}.html"
        })

# ----------------- Settings Endpoints -----------------
@app.get("/api/settings")
def api_get_settings():
    return get_all_settings()

@app.post("/api/settings")
def api_update_settings(settings: Dict[str, str]):
    for k, v in settings.items():
        set_setting(k, v)
    return get_all_settings()

# Mount static files
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Survey Paper Assistant API running. Frontend static/index.html is being generated."}
