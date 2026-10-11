from backend.latex_compiler import compile_latex_to_html

latex_sample = r"""
\documentclass[10pt,a4paper]{article}
\usepackage{amsmath}
\title{A Survey of Deep Learning Methods}
\author{Jane Doe \\ MIT}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
This paper surveys deep learning approaches, covering CNNs, RNNs, and Transformers.
We analyze $n=150$ papers from 2017--2024 and identify open challenges.
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
    VGG-16 & 72.3\% & 138M \\
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

result = compile_latex_to_html(latex_sample)
print("=== Meta ===")
print(result["meta"])
print("\n=== Warnings ===")
print(result["warnings"])
print("\n=== HTML (first 2000 chars) ===")
print(result["html"][:2000])
