import uvicorn
import os
import sys

if __name__ == "__main__":
    # Ensure current directory is in sys.path
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    print("=" * 60)
    print("  Starting Survey Paper Assistant (RAG Academic Platform)")
    print("  Open your browser at: http://127.0.0.1:8000")
    print("=" * 60)
    uvicorn.run("backend.server:app", host="127.0.0.1", port=8000, reload=True)
