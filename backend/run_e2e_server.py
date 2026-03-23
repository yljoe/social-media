from __future__ import annotations

import sys
import shutil
import os
from pathlib import Path

import uvicorn

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.db import init_db


def main() -> None:
    data_dir = os.getenv("APP_DATA_DIR")
    if data_dir:
        target = Path(data_dir)
        shutil.rmtree(target, ignore_errors=True)
        target.mkdir(parents=True, exist_ok=True)
    init_db()
    from backend.app.main import app

    uvicorn.run(app, host="127.0.0.1", port=8001, reload=False)


if __name__ == "__main__":
    main()
