# Product Requirements Document (PRD)
## Survey Paper Assistant — for First-Time Academic Writers

**Version:** 1.0
**Status:** Draft
**Owner:** Dev

---

## 1. Overview

### 1.1 Problem Statement
Students who are assigned to write a survey/review paper for the first time typically don't know:
- How a survey paper is structured
- How to synthesize multiple source papers into a coherent narrative
- How to summarize technical content without just copying it
- Whether their draft is "good enough" before submission

### 1.2 Product Vision
A guided, chatbot-style web application that takes a newbie from "I have 10 PDFs and no idea what to do" to "I have a structured, reviewed survey paper draft" — without requiring any prior knowledge of academic writing conventions.

### 1.3 Scope
**In scope (v1):**
- Simple survey / review papers only (not original-research papers, not theses)
- English-language papers only
- PDF input format only

**Out of scope (v1):**
- Original research paper writing (novel experiments, results sections)
- Non-English papers
- Automatic citation network graphs / bibliometric analysis
- Real-time multi-user collaboration on the same project
- Plagiarism detection against paid databases (Turnitin-grade) — v1 does basic similarity checks only

---

## 2. Target Users
- Undergraduate / postgraduate students writing their first survey paper (primary persona, e.g. final-year B.Tech students)
- Users have little to no familiarity with academic writing structure or terminology

---

## 3. Functional Requirements

### FR-1: Project Management
- FR-1.1: User can create a new project, giving it a name/topic.
- FR-1.2: User can view a dashboard/list of all their existing projects.
- FR-1.3: Each project stores: uploaded papers, generated outline, per-paper summaries, combined summary, review history, and chat history — independently of other projects.
- FR-1.4: User can rename, archive, or delete a project.
- FR-1.5: User can re-open a project and continue exactly where they left off (persisted state).

### FR-2: Paper Upload & Ingestion
- FR-2.1: User can upload multiple PDF papers to a project (bulk upload supported).
- FR-2.2: System extracts text, title, authors, abstract, and (if available) section headers from each PDF.
- FR-2.3: System shows per-file ingestion status: Queued → Processing → Ready / Failed.
- FR-2.4: User can remove a paper from a project after upload.
- FR-2.5: User can view extracted metadata per paper and correct it manually if extraction is wrong (e.g., mistitled paper).

### FR-3: Structure Generator
- FR-3.1: Given a topic and the set of uploaded papers, generate a suggested survey-paper outline (e.g., Abstract, Introduction, Background, Taxonomy/Classification of Approaches, Comparative Analysis, Open Challenges, Future Directions, Conclusion, References).
- FR-3.2: Outline sections are grounded in the actual uploaded papers (e.g., "Related Work" subsections reflect real clusters/themes found in the papers, not generic placeholders).
- FR-3.3: User can edit, reorder, add, or delete sections in the generated outline.
- FR-3.4: User can regenerate the outline if unsatisfied, optionally with guidance ("make it more comparison-heavy").

### FR-4: Summarization
- FR-4.1: Generate an individual summary for each uploaded paper (problem, method, key findings, limitations).
- FR-4.2: Generate a combined/synthesized summary across all papers in the project — common themes, points of agreement/disagreement, gaps in the literature.
- FR-4.3: Summaries are shown with a link/reference back to the source paper for traceability.
- FR-4.4: User can request a shorter or more detailed regeneration of any summary.

### FR-5: Draft Review
- FR-5.1: User can upload their own written draft (PDF/DOCX/plain text) for review.
- FR-5.2: System checks and reports on:
  - Structural completeness (missing expected sections)
  - Logical flow between sections
  - Citation presence/usage (are claims backed by a reference?)
  - Clarity/readability issues (overly complex sentences, undefined jargon)
  - Basic originality/similarity flags against the user's own uploaded source papers (heavy overlap = possible unintentional copying)
- FR-5.3: Review output is a structured list of issues, each with: location (section/paragraph), issue type, severity, and a suggested fix.
- FR-5.4: User can re-upload a revised draft and get a fresh review to track improvement over time (review history retained per project).

### FR-6: Conversational Interface
- FR-6.1: Each project has an associated chat thread where the user can ask follow-up questions ("Can you explain the taxonomy section more?", "Which papers disagree on X?").
- FR-6.2: Chat has access to the full context of that project (papers, outline, summaries, review results) when answering.
- FR-6.3: Chat history persists across sessions, scoped per project (like a chatbot with memory, but sandboxed to that project's data).
- FR-6.4: User can scroll back and reference earlier chat messages.

### FR-7: Export
- FR-7.1: User can export the outline, summaries, and review results as a document (PDF/DOCX/Markdown).

---

## 4. Non-Functional Requirements

- **NFR-1 Performance:** A single paper (≤30 pages) should finish ingestion + summarization within a target time budget (e.g., under 60 seconds); bulk uploads process in parallel with visible per-file progress.
- **NFR-2 Scalability:** Support at least 20 papers per project without degraded performance.
- **NFR-3 Reliability:** Project data (uploads, outlines, summaries, chat) must not be lost on browser refresh, network drop, or server restart.
- **NFR-4 Security/Privacy:** Uploaded papers and drafts are private to the uploading user; no cross-user data leakage.
- **NFR-5 Accessibility:** UI usable via keyboard navigation; sufficient color contrast; readable font sizes.
- **NFR-6 Usability:** A first-time user should be able to create a project and get a generated outline without needing external instructions (self-explanatory UI/onboarding).

---

## 5. UI/UX Requirements

### 5.1 Key Screens
1. **Dashboard** — list/grid of projects with name, last-edited date, status (e.g., "3 papers, outline ready, draft under review"), and a prominent "+ Create New Project" button.
2. **Project Workspace** — tabbed or sidebar layout with sections: *Papers*, *Outline*, *Summaries*, *Review*, *Chat*. All tabs share the same project context.
3. **Paper Upload View** — drag-and-drop zone, upload progress per file, extracted metadata preview/edit.
4. **Outline View** — editable tree/list of sections, drag-to-reorder, "Regenerate" and "Regenerate with guidance" actions.
5. **Summary View** — per-paper summary cards + a "Combined Summary" section, each with a link back to the source PDF.
6. **Review View** — annotated issue list (filterable by severity/type), diff-like view between draft versions if multiple submitted.
7. **Chat Panel** — persistent chat, visible or dockable from any tab within the project.

### 5.2 Interaction Principles
- Every long-running operation (upload, summarization, review) shows a clear progress/loading state — never a silent freeze.
- Every generated output (outline, summary, review) is editable/regenerable, never a dead-end final answer.
- Errors are shown inline, in plain language (no raw stack traces or technical error codes), with a suggested next action.
- Empty states (no projects yet, no papers yet) include a short explanation + call-to-action, since the target user is a first-timer.

---

## 6. Edge Cases

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| E1 | User uploads a non-PDF file (e.g., .docx, .png) as a "paper" | Reject with clear message; docx allowed only for draft review, not paper ingestion |
| E2 | Uploaded PDF is a scanned image with no extractable text | Detect low/zero text extraction, flag as "scanned/unreadable," suggest OCR or a different file |
| E3 | Uploaded PDF is password-protected | Detect and prompt user to upload an unlocked version |
| E4 | Uploaded PDF is corrupted or fails to parse | Mark as "Failed" with a retry option; don't block other uploads in the same batch |
| E5 | User uploads a paper unrelated to the project topic | Still ingest it, but flag low topical relevance in the summary/outline stage so the user is aware |
| E6 | User uploads only 1 paper | Structure generator still works but shows a note that survey quality/depth improves with more sources |
| E7 | User uploads duplicate papers (same PDF twice, or same paper from two sources) | Detect via title/hash similarity and warn before double-counting in summaries |
| E8 | Papers are in a language other than English | Detect and reject/flag as unsupported in v1 |
| E9 | Very large PDF (e.g., 200+ pages, a thesis instead of a paper) | Warn that this looks atypical for a "paper," allow user to proceed anyway |
| E10 | User's draft has zero citations | Flag as a structural issue, not a crash; still review the rest of the draft |
| E11 | User's draft is in a completely different topic than the uploaded papers | Note the mismatch in review output rather than silently reviewing irrelevant content |
| E12 | User submits an empty/near-empty draft (e.g., just a title page) | Return a clear "insufficient content to review" message instead of a fabricated review |
| E13 | Chat question references a paper that was later deleted from the project | Gracefully note the source is no longer available rather than erroring or hallucinating |
| E14 | User asks the chat something entirely unrelated to the project (e.g., general chit-chat) | Answer briefly but redirect toward project-relevant help |
| E15 | Two projects have the same name | Allow it, but disambiguate in the dashboard via creation date/ID |
| E16 | User deletes a project mid-operation (e.g., while summarization is running) | Cancel in-flight jobs safely; no orphaned background processes |
| E17 | Session expires / user logs out mid-upload | Preserve completed uploads; require re-auth to resume, don't lose already-processed data |
| E18 | Network drops mid-upload of a multi-file batch | Resume or clearly mark which files succeeded vs. failed; no silent partial state |

---

## 7. Failure Situations & Handling

| # | Failure | Handling |
|---|---------|----------|
| F1 | Summarization/LLM service is down or times out | Show retry option; queue the request; never show a fake/empty summary as if it succeeded |
| F2 | Outline generation produces an incoherent/garbled result | Provide a manual fallback: a generic default survey-paper template the user can edit from scratch |
| F3 | Review engine misflags correct content (false positive) | Allow user to dismiss/mark an issue as "not applicable," and don't repeat dismissed issues on next review pass unless the draft actually changed there |
| F4 | Storage/database write fails when saving a project | Retry with backoff; if it still fails, alert user clearly ("changes not saved") rather than showing false success |
| F5 | File upload exceeds size/storage limits | Explicit error stating the limit and current file size, before wasting processing time |
| F6 | Concurrent edits to the same project from two browser tabs | Last-write-wins with a warning, or lock editing in the second tab — must not silently corrupt data |
| F7 | PDF text extraction returns garbled/mojibake text (encoding issues) | Detect low-confidence extraction and flag rather than summarizing garbage silently |
| F8 | Chat context exceeds model context window (too many papers/large chat history) | Summarize/truncate older context gracefully; inform user older messages are being compressed, don't just silently drop project data |
| F9 | User account/auth failure mid-session | Preserve unsaved work in local state long enough to recover after re-authentication where feasible |
| F10 | Export generation (PDF/DOCX) fails | Clear error + retry option; never deliver a corrupted/empty export file silently |

---

## 8. Quality Assurance & Testing Plan

### 8.1 Functional Testing
- Unit tests for: PDF parsing, metadata extraction, outline generation logic, summarization pipeline, review-rule engine, project CRUD operations.
- Integration tests covering full flows: create project → upload papers → generate outline → generate summaries → upload draft → get review → export.

### 8.2 Edge Case Testing
- Dedicated test suite covering every row in Section 6 (Edge Cases) and Section 7 (Failure Situations) with expected vs. actual behavior assertions.

### 8.3 Content Quality Testing
- Manual/human evaluation of a sample set of generated outlines and summaries against a rubric: accuracy, relevance, coherence, absence of hallucinated claims.
- Regression testing: re-run the same paper sets periodically to ensure summary/outline quality doesn't degrade after model or prompt changes.

### 8.4 Usability Testing
- First-time-user testing sessions with actual target users (students who've never written a survey paper) — measure whether they can complete "create project → get outline" without external help.
- Track time-to-first-outline and time-to-first-review as key usability metrics.

### 8.5 Performance Testing
- Load testing with concurrent uploads (multiple users, multiple papers each).
- Latency benchmarks for summarization and review operations against NFR-1 targets.

### 8.6 Security Testing
- Verify project data isolation between users (no cross-account data access).
- File upload validation (reject executable/malicious file types disguised as PDFs).
- Verify persisted chat/project data is only retrievable by its owner.

### 8.7 Data Integrity Testing
- Verify no data loss on browser refresh, network interruption, or concurrent tab edits (Section 7, F6/F8/F9).
- Verify deleted projects/papers are fully removed (or properly archived per retention policy).

---

## 9. Success Metrics (v1)

- % of new users who complete "create project → generate outline" in their first session
- Average number of review cycles before a user considers their draft "ready" (should trend down as review quality improves)
- User-reported clarity/usefulness rating of generated summaries and outlines
- Failure/error rate per 100 paper uploads

---

## 10. Open Questions (to resolve before build)

- Should draft review support DOCX/Google Docs input, or PDF-only like paper ingestion?
- What's the maximum papers-per-project limit for v1 (storage/cost tradeoff)?
- Should chat memory span across a user's *entire account* (all projects) or strictly per-project? (Current spec: per-project only.)
- Is a plagiarism/similarity check against the open web needed in v1, or only against the user's own uploaded papers?
