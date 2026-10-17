"""
tests/test_latex.py
-------------------
Tests the backend LaTeX-to-HTML compiler (PyMuPDF engine) used when
a system LaTeX installation (latexmk/pdflatex) is not available.

Run from the project root:
    python -m pytest tests/test_latex.py -v
or directly:
    python tests/test_latex.py
"""
import os
import sys

import pytest

# ---------------------------------------------------------------------------
# Ensure project root is on sys.path
# ---------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# ---------------------------------------------------------------------------
# Skip if PyMuPDF is unavailable (latex_compiler uses fitz internally)
# ---------------------------------------------------------------------------
pytest.importorskip("fitz", reason="PyMuPDF (fitz) is required by latex_compiler.")

from backend.latex_compiler import compile_latex_to_html  # noqa: E402


# ---------------------------------------------------------------------------
# Shared LaTeX fixture
# ---------------------------------------------------------------------------

LATEX_SAMPLE = r"""
\documentclass[10pt,a4paper]{article}
\usepackage{amsmath}
\title{A Survey of Deep Learning Methods}
\author{Jane Doe \\ MIT}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
This paper surveys deep learning approaches, covering CNNs, RNNs, and Transformers.
We analyse $n=150$ papers from 2017--2024 and identify open challenges.
\end{abstract}

\section{Introduction}
Deep learning has achieved remarkable results \cite{lecun2015}.
The fundamental equation is $E = mc^2$.

\begin{equation}
  \mathcal{L}(\theta) = \sum_{i=1}^{N} \ell(f_\theta(x_i), y_i)
\end{equation}

\section{Methods}
\subsection{Convolutional Neural Networks}
CNNs use a sliding \textbf{kernel} to extract \textit{spatial features}.

\begin{itemize}
  \item AlexNet \cite{krizhevsky2012}
  \item ResNet \cite{he2016}
  \item VGG \cite{simonyan2015}
\end{itemize}

\begin{table}[h]
  \centering
  \caption{Benchmark Comparison}
  \begin{tabular}{|l|c|c|}
    \hline
    Method & Top-1 Acc & Params \\
    \hline
    ResNet-50 & 76.1\% & 25M \\
    VGG-16    & 72.3\% & 138M \\
    \hline
  \end{tabular}
\end{table}

\section{Conclusion}
We surveyed deep learning methods and identified three open challenges.

\begin{thebibliography}{99}
  \bibitem{lecun2015} LeCun, Y. et al. Deep Learning. \textit{Nature}, 2015.
  \bibitem{krizhevsky2012} Krizhevsky, A. et al. ImageNet Classification with CNNs. NIPS, 2012.
  \bibitem{he2016} He, K. et al. Deep Residual Learning. CVPR, 2016.
\end{thebibliography}

\end{document}
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def compiled():
    """Compile the sample LaTeX once for the whole module."""
    return compile_latex_to_html(LATEX_SAMPLE)


class TestLatexCompilerOutput:
    """Verify compile_latex_to_html returns expected keys and non-empty content."""

    def test_returns_dict(self, compiled):
        assert isinstance(compiled, dict), "Result should be a dict."

    def test_has_html_key(self, compiled):
        assert "html" in compiled, "Result must contain 'html'."

    def test_html_is_non_empty(self, compiled):
        assert compiled["html"] and len(compiled["html"]) > 10, \
            "HTML output should not be empty."

    def test_has_meta_key(self, compiled):
        assert "meta" in compiled, "Result must contain 'meta'."

    def test_meta_is_dict(self, compiled):
        assert isinstance(compiled["meta"], dict), "'meta' should be a dict."

    def test_has_warnings_key(self, compiled):
        assert "warnings" in compiled, "Result must contain 'warnings'."

    def test_warnings_is_list(self, compiled):
        assert isinstance(compiled["warnings"], list), "'warnings' should be a list."

    def test_title_extracted_in_meta(self, compiled):
        meta = compiled["meta"]
        title = meta.get("title", "")
        # The compiler should extract something from \title{}
        assert title, "Expected a non-empty title in meta."


# ---------------------------------------------------------------------------
# Allow running as a plain script for quick inspection
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    result = compile_latex_to_html(LATEX_SAMPLE)
    print("=== Meta ===")
    print(result["meta"])
    print("\n=== Warnings ===")
    print(result["warnings"])
    print("\n=== HTML (first 2000 chars) ===")
    print(result["html"][:2000])
