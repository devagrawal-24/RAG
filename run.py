import uvicorn
import os
import sys

# pyrefly: ignore [missing-import]
from dotenv import load_dotenv
load_dotenv()


if __name__ == "__main__":
    # Ensure current directory is in sys.path
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    print("=" * 60)
    #default port
    port = 8000
    for arg in sys.argv[1:]:
        if arg.startswith("port="):
            try:
                port = int(arg.split("=")[1])
            except ValueError:
                print(f"Invalid port format in argument: {arg}. Using default.")

    print("  Starting Survey Paper AI-Assistant (RAG Academic Platform)")
    print(f"  Open your browser at: http://127.0.0.1:{port}")
    print("=" * 60)
    uvicorn.run("backend.server:app", host="127.0.0.1", port=port, reload=True)
