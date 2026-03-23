from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.db import (
    DB_PATH,
    clean_default_workspace_profile_settings,
    connect,
    decode_row,
    init_db,
)


def _clean_provider_rows() -> None:
    db = connect()
    cur = db.cursor()

    cur.execute(
        """
        update provider_configs
        set name = 'OpenAI',
            base_url = 'https://api.openai.com/v1',
            api_key = '',
            model = 'gpt-4.1-mini',
            region = 'global',
            create_job_path = '',
            get_job_path = '',
            status = 'active',
            is_default = 1,
            config_json = ?
        where provider_type = 'text_llm'
          and workspace_profile = 'shared'
        """,
        (json.dumps({"supported_models": ["gpt-4.1-mini", "gpt-4.1"], "polling_enabled": True}, ensure_ascii=False),),
    )
    cur.execute(
        """
        update provider_configs
        set name = 'Google Veo',
            base_url = 'https://generativelanguage.googleapis.com/v1beta',
            api_key = '',
            model = 'veo-3.1-fast-generate-preview',
            region = 'global',
            create_job_path = '/models/veo-3.1-fast-generate-preview:predictLongRunning',
            get_job_path = '/{job_id}',
            status = 'active',
            is_default = 1,
            config_json = ?
        where provider_type = 'video_llm'
          and workspace_profile = 'shared'
        """,
        (json.dumps({"video_vendor": "google_veo", "auth_mode": "x_goog_api_key"}, ensure_ascii=False),),
    )
    cur.execute(
        """
        update provider_configs
        set name = 'Local Storage System'
        where provider_type = 'storage'
          and model = 'local-storage-v1'
        """
    )
    cur.execute(
        """
        update provider_configs
        set name = 'Google Drive System'
        where provider_type = 'storage'
          and model = 'google-drive'
        """
    )
    cur.execute(
        """
        update provider_configs
        set name = 'Supabase System'
        where provider_type = 'storage'
          and model = 'supabase-storage'
        """
    )

    cur.execute(
        """
        update provider_configs
        set api_key = ''
        where provider_type = 'text_llm'
          and workspace_profile = 'shared'
        """
    )

    cur.execute(
        """
        update provider_configs
        set config_json = json_set(
            coalesce(config_json, '{}'),
            '$.root_path', coalesce(json_extract(config_json, '$.root_path'), '')
        )
        where provider_type = 'storage'
        """
    )
    db.commit()
    db.close()


def _clean_asset_rows() -> None:
    db = connect()
    cur = db.cursor()
    cur.execute(
        """
        update asset_records
        set name = '內容生成郵件範本',
            content = '企業內部內容生成的郵件模板。',
            metadata_json = ?
        where asset_type = 'mail_template'
        """,
        (json.dumps({"subject_prefix": "[內容生成]"}, ensure_ascii=False),),
    )
    cur.execute(
        """
        update asset_records
        set name = '分鏡草案範本',
            content = '用於產生分鏡草案與場景規劃。',
            metadata_json = ?
        where asset_type = 'storyboard_template'
        """,
        (json.dumps({"scene_count": 3}, ensure_ascii=False),),
    )
    cur.execute(
        """
        update asset_records
        set name = '示範頭像 A',
            file_path = 'assets/avatar-a.png',
            metadata_json = ?
        where asset_type = 'avatar'
        """,
        (json.dumps({"preview_label": "示範頭像"}, ensure_ascii=False),),
    )
    cur.execute(
        """
        update asset_records
        set name = '示範聲音 A',
            file_path = 'assets/voice-a.wav',
            metadata_json = ?
        where asset_type = 'voice'
        """,
        (json.dumps({"preview_label": "示範聲音"}, ensure_ascii=False),),
    )
    cur.execute(
        """
        update asset_records
        set name = '簡潔正式風格',
            metadata_json = ?
        where asset_type = 'style_preset'
        """,
        (json.dumps({"tone": "clean"}, ensure_ascii=False),),
    )
    db.commit()
    db.close()


def _clean_workspace_profile_rows() -> None:
    db = connect()
    cur = db.cursor()
    cur.execute(
        """
        update workspace_profiles
        set name = 'shared',
            description = '平台預設工作設定檔，作為新設定檔的來源模板。',
            settings_json = ?
        where profile_key = 'shared'
        """,
        (json.dumps(clean_default_workspace_profile_settings(), ensure_ascii=False),),
    )

    rows = cur.execute("select * from workspace_profiles").fetchall()
    for row in rows:
        profile = decode_row(row)
        if profile is None:
            continue
        settings = clean_default_workspace_profile_settings()
        current = profile.get("settings_json") or {}
        if isinstance(current, dict):
            settings.update(current)
        cur.execute(
            """
            update workspace_profiles
            set settings_json = ?
            where id = ?
            """,
            (json.dumps(settings, ensure_ascii=False), profile["id"]),
        )

    db.commit()
    db.close()


def main() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()
    _clean_provider_rows()
    _clean_asset_rows()
    _clean_workspace_profile_rows()


if __name__ == "__main__":
    main()
