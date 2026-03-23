from __future__ import annotations

import atexit
import os
import shutil
import tempfile
from pathlib import Path


_TEMP_DATA_DIR = Path(tempfile.mkdtemp(prefix="backend-tests-", dir=str(Path(__file__).resolve().parent.parent)))
os.environ.setdefault("APP_DATA_DIR", str(_TEMP_DATA_DIR))


@atexit.register
def _cleanup_temp_data_dir() -> None:
    shutil.rmtree(_TEMP_DATA_DIR, ignore_errors=True)
