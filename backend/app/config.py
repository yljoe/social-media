import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("APP_DATA_DIR", str(BASE_DIR / "data"))).resolve()
STORAGE_DIR = DATA_DIR / "storage"
GDRIVE_MOCK_DIR = DATA_DIR / "gdrive_mock"
SUPABASE_MOCK_DIR = DATA_DIR / "supabase_mock"
DB_PATH = Path(os.getenv("APP_DB_PATH", str(DATA_DIR / "app.db"))).resolve()

# Reserved system-level SQL settings for future migration from SQLite.
# These stay in server configuration and are not editable from the UI.
DB_BACKEND = os.getenv("APP_DB_BACKEND", "sqlite")
SQL_DSN = os.getenv("APP_SQL_DSN", "")
SQL_HOST = os.getenv("APP_SQL_HOST", "")
SQL_PORT = os.getenv("APP_SQL_PORT", "")
SQL_NAME = os.getenv("APP_SQL_NAME", "")
SQL_USER = os.getenv("APP_SQL_USER", "")
SQL_PASSWORD = os.getenv("APP_SQL_PASSWORD", "")

TEXT_PRICING = {"gpt-4.1-mini": (0.40, 1.60), "gpt-4.1": (2.00, 8.00)}
VIDEO_PRICING = {"generic-video-v1": 0.18, "veo-lite": 0.20, "runway-gen4": 0.24}
