import sqlite3
import json
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any


# pyrefly: ignore [missing-import]
from dotenv import load_dotenv
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(dotenv_path)


DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
DB_PATH = os.path.join(DATA_DIR, "survey_assistant.db")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def init_db():
    conn = get_db_connection()
    with conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            topic TEXT,
            description TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            page_count INTEGER DEFAULT 0,
            word_count INTEGER DEFAULT 0,
            title TEXT,
            authors TEXT,
            abstract TEXT,
            sections_json TEXT DEFAULT '[]',
            sha256 TEXT,
            status TEXT DEFAULT 'queued',
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS paper_chunks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            paper_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            page_num INTEGER DEFAULT 1,
            section_title TEXT,
            content TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers (id) ON DELETE CASCADE
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS outlines (
            id TEXT PRIMARY KEY,
            project_id TEXT UNIQUE NOT NULL,
            sections_json TEXT NOT NULL DEFAULT '[]',
            version INTEGER DEFAULT 1,
            guidance_prompt TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS summaries (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            paper_id TEXT,
            summary_type TEXT NOT NULL, -- 'individual' or 'combined'
            problem TEXT,
            methodology TEXT,
            findings TEXT,
            limitations TEXT,
            synthesis_content TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (paper_id) REFERENCES papers (id) ON DELETE CASCADE
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS draft_reviews (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            version INTEGER DEFAULT 1,
            draft_title TEXT,
            draft_text TEXT NOT NULL,
            readability_json TEXT DEFAULT '{}',
            issues_json TEXT DEFAULT '[]',
            overlap_json TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS project_drafts (
            project_id TEXT PRIMARY KEY,
            title TEXT DEFAULT 'Survey Paper Draft',
            content TEXT DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            citations_json TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        );
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """)

        default_settings = {
            "llm_provider": os.getenv("LLM_PROVIDER", "heuristic"),
            "openrouter_api_key": os.getenv("OPENROUTER_API_KEY", ""),
            "openrouter_model": os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free"),
            "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
            "openai_model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            "ollama_base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            "ollama_model": os.getenv("OLLAMA_MODEL", "llama3"),
            "temperature": os.getenv("TEMPERATURE", "0.3")
        }
        for k, v in default_settings.items():
            conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

        if os.getenv("OPENROUTER_API_KEY"):
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('openrouter_api_key', ?)", (os.getenv("OPENROUTER_API_KEY"),))
        if os.getenv("OPENROUTER_MODEL"):
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('openrouter_model', ?)", (os.getenv("OPENROUTER_MODEL"),))
        if os.getenv("LLM_PROVIDER"):
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_provider', ?)", (os.getenv("LLM_PROVIDER"),))

    conn.close()

def list_projects() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT p.*, 
            COUNT(DISTINCT pa.id) as paper_count,
            (SELECT COUNT(*) FROM outlines o WHERE o.project_id = p.id) as has_outline,
            (SELECT COUNT(*) FROM summaries s WHERE s.project_id = p.id) as summary_count,
            (SELECT COUNT(*) FROM draft_reviews d WHERE d.project_id = p.id) as review_count
        FROM projects p
        LEFT JOIN papers pa ON p.id = pa.project_id
        GROUP BY p.id
        ORDER BY p.updated_at DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def create_project(name: str, topic: str = "", description: str = "") -> Dict[str, Any]:
    conn = get_db_connection()
    pid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    with conn:
        conn.execute(
            "INSERT INTO projects (id, name, topic, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
            (pid, name, topic, description, now, now)
        )
    conn.close()
    return get_project(pid)

def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute("""
        SELECT p.*, 
            COUNT(DISTINCT pa.id) as paper_count,
            (SELECT COUNT(*) FROM outlines o WHERE o.project_id = p.id) as has_outline,
            (SELECT COUNT(*) FROM summaries s WHERE s.project_id = p.id) as summary_count,
            (SELECT COUNT(*) FROM draft_reviews d WHERE d.project_id = p.id) as review_count
        FROM projects p
        LEFT JOIN papers pa ON p.id = pa.project_id
        WHERE p.id = ?
        GROUP BY p.id
    """, (project_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def update_project(project_id: str, name: str, topic: str, description: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    now = datetime.utcnow().isoformat()
    with conn:
        conn.execute(
            "UPDATE projects SET name = ?, topic = ?, description = ?, updated_at = ? WHERE id = ?",
            (name, topic, description, now, project_id)
        )
    conn.close()
    return get_project(project_id)

def touch_project(project_id: str):
    conn = get_db_connection()
    now = datetime.utcnow().isoformat()
    with conn:
        conn.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
    conn.close()

def delete_project(project_id: str) -> bool:
    conn = get_db_connection()
    papers = conn.execute("SELECT file_path FROM papers WHERE project_id = ?", (project_id,)).fetchall()
    for p in papers:
        if p["file_path"] and os.path.exists(p["file_path"]):
            try:
                os.remove(p["file_path"])
            except Exception:
                pass
    with conn:
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.close()
    return True

def add_paper(project_id: str, filename: str, original_name: str, file_path: str, file_size: int, sha256: str) -> str:
    conn = get_db_connection()
    paper_id = str(uuid.uuid4())
    with conn:
        conn.execute("""
            INSERT INTO papers (id, project_id, filename, original_name, file_path, file_size, sha256, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')
        """, (paper_id, project_id, filename, original_name, file_path, file_size, sha256))
    conn.close()
    touch_project(project_id)
    return paper_id

def update_paper_metadata(paper_id: str, **kwargs) -> bool:
    conn = get_db_connection()
    fields = []
    values = []
    for k, v in kwargs.items():
        fields.append(f"{k} = ?")
        values.append(v if not isinstance(v, (dict, list)) else json.dumps(v))
    values.append(paper_id)
    query = f"UPDATE papers SET {', '.join(fields)} WHERE id = ?"
    with conn:
        conn.execute(query, tuple(values))
    conn.close()
    return True

def get_paper(paper_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM papers WHERE id = ?", (paper_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d.get("sections_json"):
        try:
            d["sections"] = json.loads(d["sections_json"])
        except Exception:
            d["sections"] = []
    return d

def list_papers(project_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM papers WHERE project_id = ? ORDER BY created_at ASC", (project_id,)).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        if d.get("sections_json"):
            try:
                d["sections"] = json.loads(d["sections_json"])
            except Exception:
                d["sections"] = []
        results.append(d)
    return results

def search_papers_for_project(project_id: str, query: str = "") -> List[Dict[str, Any]]:
    conn = get_db_connection()
    q = (query or "").strip().lower()
    
    if not q:
        rows = conn.execute(
            "SELECT * FROM papers WHERE project_id = ? ORDER BY created_at DESC", 
            (project_id,)
        ).fetchall()
    else:
        pattern = f"%{q}%"
        rows = conn.execute("""
            SELECT * FROM papers 
            WHERE project_id = ? AND (
                LOWER(title) LIKE ? OR 
                LOWER(authors) LIKE ? OR 
                LOWER(abstract) LIKE ? OR 
                LOWER(original_name) LIKE ? OR
                LOWER(id) LIKE ?
            )
            ORDER BY created_at DESC
        """, (project_id, pattern, pattern, pattern, pattern, pattern)).fetchall()

    summaries = conn.execute(
        "SELECT * FROM summaries WHERE project_id = ? AND summary_type = 'individual'", 
        (project_id,)
    ).fetchall()
    conn.close()

    summary_map = {}
    for s in summaries:
        sd = dict(s)
        if sd.get("paper_id"):
            summary_map[sd["paper_id"]] = sd

    results = []
    for r in rows:
        d = dict(r)
        if d.get("sections_json"):
            try:
                d["sections"] = json.loads(d["sections_json"])
            except Exception:
                d["sections"] = []
        
        summ = summary_map.get(d["id"])
        if summ:
            key_findings_parts = []
            if summ.get("problem"):
                key_findings_parts.append(f"Problem: {summ['problem']}")
            if summ.get("methodology"):
                key_findings_parts.append(f"Methodology: {summ['methodology']}")
            if summ.get("findings"):
                key_findings_parts.append(f"Findings: {summ['findings']}")
            if summ.get("limitations"):
                key_findings_parts.append(f"Limitations: {summ['limitations']}")
            d["key_findings"] = " | ".join(key_findings_parts)
            d["problem"] = summ.get("problem", "")
            d["methodology"] = summ.get("methodology", "")
            d["findings"] = summ.get("findings", "")
            d["limitations"] = summ.get("limitations", "")
        else:
            d["key_findings"] = d.get("abstract", "")[:300] if d.get("abstract") else ""

        results.append(d)
    return results

def find_papers_by_mentions(project_id: str, mention_terms: List[str]) -> List[Dict[str, Any]]:
    all_papers = search_papers_for_project(project_id, "")
    if not all_papers or not mention_terms:
        return []

    matched = {}
    for term in mention_terms:
        t_clean = term.strip().lower()
        if not t_clean:
            continue
        for p in all_papers:
            p_id = p["id"].lower()
            p_title = (p.get("title") or "").lower()
            p_orig = (p.get("original_name") or "").lower()
            p_auth = (p.get("authors") or "").lower()
            
            # Check if mention term matches ID, title, original_name or substring
            if (t_clean == p_id or 
                t_clean in p_title or p_title in t_clean or 
                t_clean in p_orig or p_orig in t_clean or
                (len(t_clean) >= 3 and t_clean in p_auth)):
                matched[p["id"]] = p

    return list(matched.values())

def delete_paper(paper_id: str) -> bool:
    conn = get_db_connection()
    p = conn.execute("SELECT file_path, project_id FROM papers WHERE id = ?", (paper_id,)).fetchone()
    if p:
        if p["file_path"] and os.path.exists(p["file_path"]):
            try:
                os.remove(p["file_path"])
            except Exception:
                pass
        with conn:
            conn.execute("DELETE FROM papers WHERE id = ?", (paper_id,))
        touch_project(p["project_id"])
    conn.close()
    return True

def find_duplicate_paper(project_id: str, sha256: str, title: str = "") -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute(
        "SELECT id, original_name, title FROM papers WHERE project_id = ? AND (sha256 = ? OR (title != '' AND LOWER(title) = LOWER(?)))",
        (project_id, sha256, title)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

def save_chunks(chunks: List[Dict[str, Any]]):
    if not chunks:
        return
    conn = get_db_connection()
    with conn:
        for c in chunks:
            chunk_id = c.get("id") or str(uuid.uuid4())
            conn.execute("""
                INSERT INTO paper_chunks (id, project_id, paper_id, chunk_index, page_num, section_title, content)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (chunk_id, c["project_id"], c["paper_id"], c["chunk_index"], c.get("page_num", 1), c.get("section_title", ""), c["content"]))
    conn.close()

def get_project_chunks(project_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT c.*, p.title as paper_title, p.original_name
        FROM paper_chunks c
        JOIN papers p ON c.paper_id = p.id
        WHERE c.project_id = ?
        ORDER BY c.paper_id, c.chunk_index
    """, (project_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_outline(project_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM outlines WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    try:
        d["sections"] = json.loads(d["sections_json"])
    except Exception:
        d["sections"] = []
    return d

def save_outline(project_id: str, sections: List[Dict[str, Any]], guidance: str = "") -> Dict[str, Any]:
    conn = get_db_connection()
    sections_json = json.dumps(sections)
    now = datetime.utcnow().isoformat()
    existing = get_outline(project_id)
    version = (existing["version"] + 1) if existing else 1
    outline_id = existing["id"] if existing else str(uuid.uuid4())

    with conn:
        conn.execute("""
            INSERT INTO outlines (id, project_id, sections_json, version, guidance_prompt, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
                sections_json = excluded.sections_json,
                version = excluded.version,
                guidance_prompt = excluded.guidance_prompt,
                updated_at = excluded.updated_at
        """, (outline_id, project_id, sections_json, version, guidance, now))
    conn.close()
    touch_project(project_id)
    return get_outline(project_id)

def get_summaries(project_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT s.*, p.title as paper_title, p.original_name, p.authors
        FROM summaries s
        LEFT JOIN papers p ON s.paper_id = p.id
        WHERE s.project_id = ?
        ORDER BY s.summary_type DESC, s.updated_at DESC
    """, (project_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_summary(project_id: str, summary_type: str, paper_id: Optional[str] = None,
                 problem: str = "", methodology: str = "", findings: str = "",
                 limitations: str = "", synthesis_content: str = "") -> str:
    conn = get_db_connection()
    sid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    with conn:
        if paper_id:
            conn.execute("DELETE FROM summaries WHERE project_id = ? AND paper_id = ? AND summary_type = ?", (project_id, paper_id, summary_type))
        elif summary_type == 'combined':
            conn.execute("DELETE FROM summaries WHERE project_id = ? AND summary_type = 'combined'", (project_id,))

        conn.execute("""
            INSERT INTO summaries (id, project_id, paper_id, summary_type, problem, methodology, findings, limitations, synthesis_content, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (sid, project_id, paper_id, summary_type, problem, methodology, findings, limitations, synthesis_content, now))
    conn.close()
    touch_project(project_id)
    return sid

def save_draft_review(project_id: str, draft_title: str, draft_text: str,
                      readability: Dict[str, Any], issues: List[Dict[str, Any]], overlap: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_db_connection()
    rid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    prev = conn.execute("SELECT MAX(version) as max_v FROM draft_reviews WHERE project_id = ?", (project_id,)).fetchone()
    version = (prev["max_v"] or 0) + 1

    with conn:
        conn.execute("""
            INSERT INTO draft_reviews (id, project_id, version, draft_title, draft_text, readability_json, issues_json, overlap_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (rid, project_id, version, draft_title, draft_text, json.dumps(readability), json.dumps(issues), json.dumps(overlap), now))
    conn.close()
    touch_project(project_id)
    return get_draft_review(rid)

def get_draft_review(review_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM draft_reviews WHERE id = ?", (review_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["readability"] = json.loads(d.get("readability_json") or "{}")
    d["issues"] = json.loads(d.get("issues_json") or "[]")
    d["overlap"] = json.loads(d.get("overlap_json") or "{}")
    return d

def list_draft_reviews(project_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM draft_reviews WHERE project_id = ? ORDER BY version DESC", (project_id,)).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        d["readability"] = json.loads(d.get("readability_json") or "{}")
        d["issues"] = json.loads(d.get("issues_json") or "[]")
        d["overlap"] = json.loads(d.get("overlap_json") or "{}")
        results.append(d)
    return results

def save_project_draft(project_id: str, title: str, content: str) -> Dict[str, Any]:
    conn = get_db_connection()
    now = datetime.utcnow().isoformat()
    with conn:
        conn.execute("""
            INSERT INTO project_drafts (project_id, title, content, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                updated_at = excluded.updated_at
        """, (project_id, title, content, now))
    conn.close()
    touch_project(project_id)
    return {"project_id": project_id, "title": title, "content": content, "updated_at": now}

def get_project_draft(project_id: str) -> Dict[str, Any]:
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM project_drafts WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return {"project_id": project_id, "title": "Survey Paper Draft", "content": "", "updated_at": None}

def add_chat_message(project_id: str, role: str, content: str, citations: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    conn = get_db_connection()
    mid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    citations_json = json.dumps(citations or [])
    with conn:
        conn.execute("""
            INSERT INTO chat_messages (id, project_id, role, content, citations_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (mid, project_id, role, content, citations_json, now))
    conn.close()
    return {"id": mid, "project_id": project_id, "role": role, "content": content, "citations": citations or [], "created_at": now}

def get_chat_history(project_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC LIMIT ?", (project_id, limit)).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        d["citations"] = json.loads(d.get("citations_json") or "[]")
        results.append(d)
    return results

def clear_chat_history(project_id: str) -> bool:
    conn = get_db_connection()
    with conn:
        conn.execute("DELETE FROM chat_messages WHERE project_id = ?", (project_id,))
    conn.close()
    return True

def get_all_settings() -> Dict[str, str]:
    conn = get_db_connection()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    settings = {r["key"]: r["value"] for r in rows}

    env_keys = {
        "OPENROUTER_API_KEY": "openrouter_api_key",
        "OPENROUTER_MODEL": "openrouter_model",
        "LLM_PROVIDER": "llm_provider",
        "OPENAI_API_KEY": "openai_api_key",
        "OPENAI_MODEL": "openai_model",
        "OLLAMA_BASE_URL": "ollama_base_url",
        "OLLAMA_MODEL": "ollama_model",
        "TEMPERATURE": "temperature",
    }
    for env_k, setting_k in env_keys.items():
        val = os.getenv(env_k)
        if val is not None and val.strip() != "":
            settings[setting_k] = val.strip()

    return settings

def set_setting(key: str, value: str):
    conn = get_db_connection()
    with conn:
        conn.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))
    conn.close()

init_db()
