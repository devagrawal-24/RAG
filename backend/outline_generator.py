import json
import re
from typing import List, Dict, Any
from backend.llm_client import LLMClient

def extract_key_concepts(papers: List[Dict[str, Any]]) -> List[str]:
    concepts = []
    for p in papers:
        # Extract keywords from title and abstract
        title = p.get("title") or ""
        abstract = p.get("abstract") or ""
        text = f"{title}. {abstract}"
        # Look for capitalized terminology or acronyms or key phrases
        found = re.findall(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b", text)
        for term in found:
            t_lower = term.lower()
            if t_lower not in ["abstract", "introduction", "university", "department", "proceedings", "paper"]:
                concepts.append(term)
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for c in concepts:
        if c.lower() not in seen and len(c) > 3:
            seen.add(c.lower())
            unique.append(c)
    return unique[:12]

def generate_outline(project: Dict[str, Any], papers: List[Dict[str, Any]], guidance: str = "", settings: Dict[str, str] = None) -> List[Dict[str, Any]]:
    topic = project.get("topic") or project.get("name") or "Computer Science Literature Survey"
    settings = settings or {}
    client = LLMClient(settings)

    paper_summaries = []
    for i, p in enumerate(papers, 1):
        paper_summaries.append(f"[{i}] Title: {p.get('title', 'Untitled')}\nAuthors: {p.get('authors', 'Unknown')}\nAbstract preview: {p.get('abstract', '')[:300]}...")

    corpus_context = "\n\n".join(paper_summaries) if paper_summaries else "No papers uploaded yet."
    key_themes = extract_key_concepts(papers)

    system_prompt = (
        "You are an expert academic advisor and survey paper architect. "
        "Your task is to generate a comprehensive, grounded survey paper outline strictly based on the user's project topic and uploaded papers. "
        "Return a valid JSON array of sections. Each section must be an object with: "
        "'id' (string), 'number' (string, e.g. '1', '2', '2.1'), 'title' (string), 'description' (string explaining what to write here and which papers to cite), "
        "and 'suggested_citations' (array of paper titles or numbers). "
        "Ensure standard survey structure: 1. Abstract & Motivation, 2. Introduction & Background, "
        "3. Taxonomy & Categorization of Approaches (grounded in the real papers' methods), "
        "4. Comparative Analysis & Performance Trade-offs, 5. Open Challenges & Limitations, 6. Future Directions, 7. Conclusion & References. "
        "Output ONLY the JSON array, no extra markdown or commentary."
    )

    user_prompt = f"Project Topic: {topic}\n"
    if guidance:
        user_prompt += f"Special Guidance/Focus: {guidance}\n\n"
    user_prompt += f"Uploaded Papers ({len(papers)} papers):\n{corpus_context}\n\n"
    user_prompt += "Generate the grounded survey outline now in JSON format."

    # If active API configured, attempt LLM call
    if client.provider in ["openrouter", "openai", "ollama"]:
        try:
            raw_response = client.generate([{"role": "user", "content": user_prompt}], system_prompt)
            # Try to parse JSON
            json_match = re.search(r"\[\s*\{[\s\S]*\}\s*\]", raw_response)
            if json_match:
                parsed = json.loads(json_match.group(0))
                if isinstance(parsed, list) and len(parsed) >= 4:
                    return parsed
        except Exception as e:
            print(f"[OutlineGenerator] LLM failed, using heuristic outline: {e}")

    # Deterministic High-Quality Academic Heuristic Outline
    t1 = key_themes[0] if len(key_themes) > 0 else "Foundational Methods"
    t2 = key_themes[1] if len(key_themes) > 1 else "Modern Architectures"
    t3 = key_themes[2] if len(key_themes) > 2 else "Empirical Evaluation"

    p_titles = [p.get("title", f"Paper {i}") for i, p in enumerate(papers, 1)]

    sections = [
        {
            "id": "sec-1",
            "number": "1",
            "title": "Abstract & Executive Motivation",
            "description": f"Concise summary (200-250 words) defining the scope of '{topic}', research gaps, synthesis of {len(papers)} core papers, and key takeaways for scholars.",
            "suggested_citations": p_titles[:2]
        },
        {
            "id": "sec-2",
            "number": "2",
            "title": "Introduction & Background Foundations",
            "description": f"Formal introduction to {topic}. Establishes standard problem definitions, historical evolution, theoretical underpinnings, and justification for why this survey is needed.",
            "suggested_citations": p_titles[:3]
        },
        {
            "id": "sec-3",
            "number": "3",
            "title": f"Taxonomy & Categorization of Current Approaches",
            "description": f"Structured hierarchical taxonomy classifying literature along operational dimensions (e.g. {t1}, {t2}, {t3}). Synthesizes how approaches differ in architectural assumptions.",
            "suggested_citations": p_titles
        },
        {
            "id": "sec-4",
            "number": "4",
            "title": "Comparative Analysis & Evaluation Matrix",
            "description": "Cross-cutting comparative matrix contrasting benchmarks, datasets, computational complexity, accuracy metrics, and qualitative trade-offs between competing frameworks.",
            "suggested_citations": p_titles
        },
        {
            "id": "sec-5",
            "number": "5",
            "title": "Critical Open Challenges & Vulnerabilities",
            "description": "Rigorous identification of unresolved limitations: scalability bottlenecks, reproducibility issues, domain adaptation hurdles, and evaluation inconsistencies across studies.",
            "suggested_citations": p_titles
        },
        {
            "id": "sec-6",
            "number": "6",
            "title": "Future Research Roadmap",
            "description": f"Actionable prospective agenda highlighting high-impact directions, cross-disciplinary opportunities, and novel benchmarks for next-generation research in {topic}.",
            "suggested_citations": []
        },
        {
            "id": "sec-7",
            "number": "7",
            "title": "Conclusion & Bibliographic References",
            "description": "Concluding synthesis of survey findings and complete verified bibliographic citations adhering to IEEE/ACM citation style.",
            "suggested_citations": p_titles
        }
    ]

    if guidance:
        # Incorporate guidance into comparative section
        for s in sections:
            if s["number"] in ["3", "4"]:
                s["description"] += f" (Emphasizing user guidance: '{guidance}')"

    return sections
