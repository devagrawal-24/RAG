import math
import re
import numpy as np
from typing import List, Dict, Any, Tuple
from rank_bm25 import BM25Okapi

# pyrefly: ignore [missing-import]
import nltk
# pyrefly: ignore [missing-import]
from nltk.corpus import stopwords

# Academic-specific stop words to filter out common boilerplate
ACADEMIC_STOPWORDS = {"paper", "presents", "study", "propose", "method", "results", "using", "based"}

try:
    STOPWORDS = set(stopwords.words("english")) | ACADEMIC_STOPWORDS
except (LookupError, AttributeError):
    nltk.download("stopwords", quiet=True)
    try:
        STOPWORDS = set(stopwords.words("english")) | ACADEMIC_STOPWORDS
    except Exception:
        # Graceful fallback if offline
        STOPWORDS = {"the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "with", "is", "was"} | ACADEMIC_STOPWORDS

def tokenize(text: str) -> List[str]:
    text = text.lower()
    tokens = re.findall(r"\b[a-z0-9_-]{2,}\b", text)
    return [t for t in tokens if t not in STOPWORDS]

class HybridRetriever:
    def __init__(self, chunks: List[Dict[str, Any]]):
        self.chunks = chunks
        self.bm25 = None
        self.vocabulary: Dict[str, int] = {}
        self.idf: np.ndarray = np.array([])
        self.doc_vectors: np.ndarray = np.array([])
        self._build_indexes()

    def _build_indexes(self):
        if not self.chunks:
            return

        tokenized_corpus = []
        doc_freq: Dict[str, int] = {}
        N = len(self.chunks)

        for chunk in self.chunks:
            tokens = tokenize(chunk["content"] + " " + chunk.get("section_title", ""))
            tokenized_corpus.append(tokens)
            for t in set(tokens):
                doc_freq[t] = doc_freq.get(t, 0) + 1

        self.bm25 = BM25Okapi(tokenized_corpus)

        # Build TF-IDF semantic feature matrix for dense cosine retrieval
        sorted_vocab = sorted([t for t, freq in doc_freq.items() if freq >= 1])
        self.vocabulary = {t: idx for idx, t in enumerate(sorted_vocab)}
        V = len(self.vocabulary)
        if V == 0:
            return

        # Calculate IDF
        idf_vec = np.zeros(V, dtype=np.float32)
        for term, idx in self.vocabulary.items():
            df = doc_freq.get(term, 1)
            idf_vec[idx] = math.log((N + 1) / (df + 1)) + 1.0
        self.idf = idf_vec

        # Compute document vectors
        vectors = np.zeros((N, V), dtype=np.float32)
        for i, tokens in enumerate(tokenized_corpus):
            tf_counts: Dict[str, int] = {}
            for t in tokens:
                if t in self.vocabulary:
                    tf_counts[t] = tf_counts.get(t, 0) + 1
            for t, count in tf_counts.items():
                col = self.vocabulary[t]
                # Sublinear term frequency
                vectors[i, col] = (1.0 + math.log(count)) * self.idf[col]

        # Normalize rows to unit length for cosine similarity
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self.doc_vectors = vectors / norms

    def query(self, query_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
        if not self.chunks or not self.bm25:
            return []

        q_tokens = tokenize(query_text)
        if not q_tokens:
            q_tokens = query_text.lower().split()

        # 1. BM25 scoring
        bm25_scores = self.bm25.get_scores(q_tokens)
        bm25_ranked = np.argsort(bm25_scores)[::-1]

        # 2. Dense Semantic Vector scoring
        dense_scores = np.zeros(len(self.chunks), dtype=np.float32)
        if len(self.vocabulary) > 0 and len(self.doc_vectors) > 0:
            q_vec = np.zeros(len(self.vocabulary), dtype=np.float32)
            q_counts: Dict[str, int] = {}
            for t in q_tokens:
                if t in self.vocabulary:
                    q_counts[t] = q_counts.get(t, 0) + 1
            for t, count in q_counts.items():
                col = self.vocabulary[t]
                q_vec[col] = (1.0 + math.log(count)) * self.idf[col]
            q_norm = np.linalg.norm(q_vec)
            if q_norm > 0:
                q_vec = q_vec / q_norm
                dense_scores = np.dot(self.doc_vectors, q_vec)

        dense_ranked = np.argsort(dense_scores)[::-1]

        # 3. Reciprocal Rank Fusion (RRF)
        # RRF score = 1 / (k + rank_bm25) + 1 / (k + rank_dense)
        K = 60
        rrf_scores = np.zeros(len(self.chunks), dtype=np.float32)

        for rank, doc_idx in enumerate(bm25_ranked):
            rrf_scores[doc_idx] += 1.0 / (K + rank + 1)
        for rank, doc_idx in enumerate(dense_ranked):
            rrf_scores[doc_idx] += 1.2 / (K + rank + 1)  # Slightly favor semantic match

        top_indices = np.argsort(rrf_scores)[::-1][:top_k]

        results = []
        for idx in top_indices:
            chunk = dict(self.chunks[idx])
            chunk["bm25_score"] = float(bm25_scores[idx])
            chunk["dense_score"] = float(dense_scores[idx])
            chunk["rrf_score"] = float(rrf_scores[idx])
            results.append(chunk)

        return results
