# Dockerfile for Survey Paper Assistant LaTeX Build Environment
FROM python:3.11-slim-bookworm

# Prevent interactive prompts during apt install
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies and TeX Live packages specified in latexUI.md
RUN apt-get update && apt-get install -y --no-install-recommends \
    latexmk \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-publishers \
    texlive-bibtex-extra \
    texlive-fonts-recommended \
    ghostscript \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for safe sandboxed TeX compilation
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Copy dependency requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . /app

# Ensure proper ownership of data directory
RUN mkdir -p /app/data/uploads && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Start FastAPI server via uvicorn
CMD ["uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8000"]
