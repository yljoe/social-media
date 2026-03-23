from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from datetime import UTC, datetime
from typing import Any

from .config import DATA_DIR, DB_PATH, GDRIVE_MOCK_DIR, STORAGE_DIR, SUPABASE_MOCK_DIR


def now() -> str:
    return datetime.now(UTC).isoformat()


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def table_columns(db: sqlite3.Connection, table_name: str) -> set[str]:
    rows = db.execute(f"pragma table_info({table_name})").fetchall()
    return {row["name"] for row in rows}


def decode_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    item = dict(row)
    for key in ("config_json", "metadata_json", "request_json", "response_json", "cost_json", "detail_json", "policy_json", "settings_json"):
        if key in item and item[key]:
            item[key] = json.loads(item[key])
    return item


def default_workspace_profile_settings(
    default_text_provider_id: str = "",
    default_video_provider_id: str = "",
) -> dict[str, Any]:
    return {
        "default_language": "zh-TW",
        "default_target_audience": "企業內部同仁",
        "default_text_provider_id": default_text_provider_id,
        "default_video_provider_id": default_video_provider_id,
        "default_total_duration_seconds": 24,
        "default_scene_duration_seconds": 8,
        "default_resolution": "1280x720",
        "default_aspect_ratio": "16:9",
        "default_subtitle_enabled": True,
        "default_subtitle_language": "繁體中文",
        "default_font_family": "Noto Sans TC",
        "default_render_style_asset_id": "",
        "default_asset_provider_role": "google-drive",
        "default_document_provider_role": "supabase-storage",
    }


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    GDRIVE_MOCK_DIR.mkdir(parents=True, exist_ok=True)
    SUPABASE_MOCK_DIR.mkdir(parents=True, exist_ok=True)


def init_db() -> None:
    ensure_dirs()
    db = connect()
    cur = db.cursor()
    cur.executescript(
        """
        create table if not exists projects (
            id text primary key,
            name text not null,
            description text not null,
            workspace_profile text not null,
            status text not null,
            created_at text not null,
            updated_at text not null
        );
        create table if not exists workspace_profiles (
            id text primary key,
            profile_key text not null unique,
            name text not null,
            description text not null,
            source_profile_key text,
            settings_json text not null,
            status text not null,
            is_system integer not null,
            created_at text not null,
            updated_at text not null
        );
        create table if not exists provider_configs (
            id text primary key,
            provider_type text not null,
            workspace_profile text not null,
            credential_scope text not null,
            name text not null,
            base_url text not null,
            api_key text not null,
            model text not null,
            region text not null,
            create_job_path text not null,
            get_job_path text not null,
            status text not null,
            is_default integer not null,
            config_json text not null,
            created_at text not null,
            updated_at text not null
        );
        create table if not exists asset_records (
            id text primary key,
            asset_type text not null,
            name text not null,
            content text not null,
            file_path text not null,
            status text not null,
            metadata_json text not null,
            created_at text not null,
            updated_at text not null
        );
        create table if not exists text_generation_jobs (
            id text primary key,
            project_id text not null,
            provider_id text not null,
            model text not null,
            request_json text not null,
            response_json text not null,
            input_tokens integer not null,
            output_tokens integer not null,
            estimated_cost real not null,
            latency_ms integer not null,
            created_at text not null
        );
        create table if not exists storyboard_scenes (
            id text primary key,
            project_id text not null,
            scene_key text not null,
            scene_title text not null,
            prompt text not null,
            narration text not null,
            subtitle text not null,
            duration integer not null,
            created_at text not null
        );
        create table if not exists scene_render_runs (
            id text primary key,
            project_id text not null,
            scene_key text not null,
            provider_id text not null,
            request_json text not null,
            response_json text not null,
            cost_json text not null,
            status text not null,
            created_at text not null
        );
        create table if not exists scene_outputs (
            id text primary key,
            project_id text not null,
            scene_key text not null,
            run_id text not null,
            mp4_path text not null,
            mp3_path text not null,
            srt_path text not null,
            metadata_json text not null,
            created_at text not null
        );
        create table if not exists merge_jobs (
            id text primary key,
            project_id text not null,
            final_video_path text not null,
            final_srt_path text not null,
            cost_json text not null,
            created_at text not null
        );
        create table if not exists final_videos (
            id text primary key,
            project_id text not null,
            merge_job_id text not null,
            file_path text not null,
            srt_path text not null,
            metadata_json text not null,
            created_at text not null
        );
        create table if not exists cost_ledgers (
            id text primary key,
            project_id text not null,
            category text not null,
            item_ref_id text not null,
            amount real not null,
            detail_json text not null,
            created_at text not null
        );
        create table if not exists storage_bindings (
            id text primary key,
            project_id text not null,
            workspace_profile text not null,
            provider_id text not null,
            root_path text not null,
            mode text not null,
            detail_json text not null,
            created_at text not null,
            updated_at text not null,
            unique(project_id, workspace_profile)
        );
        create table if not exists provider_call_logs (
            id text primary key,
            provider_id text not null,
            provider_type text not null,
            project_id text not null,
            action text not null,
            request_json text not null,
            response_json text not null,
            status text not null,
            error_message text not null,
            created_at text not null
        );
        create table if not exists storage_policies (
            id text primary key,
            workspace_profile text not null,
            policy_scope text not null,
            data_provider_id text not null,
            asset_provider_id text not null,
            video_provider_id text not null,
            fallback_provider_id text not null,
            policy_json text not null,
            created_at text not null,
            updated_at text not null,
            unique(workspace_profile)
        );
        """
    )
    migrate_schema(db)
    db.commit()
    seed_workspace_profiles(db)
    seed_defaults(db)
    ensure_storage_provider_variants(db)
    backfill_provider_defaults(db)
    backfill_provider_scopes(db)
    sync_workspace_profile_settings(db)
    seed_storage_policy(db)
    db.close()


def migrate_schema(db: sqlite3.Connection) -> None:
    project_columns = table_columns(db, "projects")
    if "workspace_profile" not in project_columns:
        db.execute("alter table projects add column workspace_profile text not null default 'shared'")

    workspace_profile_columns = table_columns(db, "workspace_profiles")
    if "settings_json" not in workspace_profile_columns:
        default_settings_json = json.dumps(default_workspace_profile_settings(), ensure_ascii=False).replace("'", "''")
        db.execute(
            f"alter table workspace_profiles add column settings_json text not null default '{default_settings_json}'"
        )

    provider_columns = table_columns(db, "provider_configs")
    if "workspace_profile" not in provider_columns:
        db.execute("alter table provider_configs add column workspace_profile text not null default 'shared'")
    if "credential_scope" not in provider_columns:
        db.execute("alter table provider_configs add column credential_scope text not null default 'workspace'")

    policy_columns = table_columns(db, "storage_policies")
    if "workspace_profile" not in policy_columns or "policy_scope" not in policy_columns:
        legacy_rows = [decode_row(row) for row in db.execute("select * from storage_policies").fetchall()]
        db.execute("alter table storage_policies rename to storage_policies_legacy")
        db.execute(
            """
            create table storage_policies (
                id text primary key,
                workspace_profile text not null,
                policy_scope text not null,
                data_provider_id text not null,
                asset_provider_id text not null,
                video_provider_id text not null,
                fallback_provider_id text not null,
                policy_json text not null,
                created_at text not null,
                updated_at text not null,
                unique(workspace_profile)
            )
            """
        )
        for row in legacy_rows:
            if row is None:
                continue
            db.execute(
                """
                insert into storage_policies
                (id, workspace_profile, policy_scope, data_provider_id, asset_provider_id, video_provider_id, fallback_provider_id, policy_json, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    "shared",
                    "system",
                    row["data_provider_id"],
                    row.get("video_provider_id", row["data_provider_id"]),
                    row["video_provider_id"],
                    row["fallback_provider_id"],
                    json.dumps(row["policy_json"], ensure_ascii=False),
                    row["created_at"],
                    row["updated_at"],
                ),
            )
        db.execute("drop table storage_policies_legacy")
    elif "asset_provider_id" not in policy_columns:
        db.execute("alter table storage_policies add column asset_provider_id text not null default ''")
        db.execute(
            """
            update storage_policies
            set asset_provider_id = case
                when asset_provider_id = '' then video_provider_id
                else asset_provider_id
            end
            """
        )

    binding_columns = table_columns(db, "storage_bindings")
    if "workspace_profile" not in binding_columns:
        legacy_rows = [decode_row(row) for row in db.execute("select * from storage_bindings").fetchall()]
        db.execute("alter table storage_bindings rename to storage_bindings_legacy")
        db.execute(
            """
            create table storage_bindings (
                id text primary key,
                project_id text not null,
                workspace_profile text not null,
                provider_id text not null,
                root_path text not null,
                mode text not null,
                detail_json text not null,
                created_at text not null,
                updated_at text not null,
                unique(project_id, workspace_profile)
            )
            """
        )
        for row in legacy_rows:
            if row is None:
                continue
            db.execute(
                """
                insert into storage_bindings
                (id, project_id, workspace_profile, provider_id, root_path, mode, detail_json, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    row["project_id"],
                    "shared",
                    row["provider_id"],
                    row["root_path"],
                    row["mode"],
                    json.dumps(row["detail_json"], ensure_ascii=False),
                    row["created_at"],
                    row["updated_at"],
                ),
            )
        db.execute("drop table storage_bindings_legacy")


def seed_defaults(db: sqlite3.Connection) -> None:
    cur = db.cursor()
    timestamp = now()
    if cur.execute("select count(*) from provider_configs").fetchone()[0] == 0:
        defaults = [
            (
                "text_llm",
                "shared",
                "workspace",
                "OpenAI",
                "https://api.openai.com/v1/chat/completions",
                os.getenv("OPENAI_API_KEY", ""),
                "gpt-4.1-mini",
                "global",
                "",
                "",
                "active",
                1,
                {"supported_models": ["gpt-4.1-mini", "gpt-4.1"]},
            ),
            (
                "video_llm",
                "shared",
                "workspace",
                "Generic REST Video",
                "",
                "",
                "generic-video-v1",
                "global",
                "",
                "",
                "active",
                1,
                {"polling_enabled": True, "mode": "mock_first"},
            ),
            (
                "storage",
                "system",
                "system",
                "Local Storage",
                "",
                "",
                "local-storage-v1",
                "local",
                "",
                "",
                "active",
                1,
                {"root_path": str(STORAGE_DIR), "storage_mode": "local"},
            ),
            (
                "storage",
                "system",
                "system",
                "Google Drive (Mock)",
                "",
                "",
                "google-drive",
                "global",
                "",
                "",
                "inactive",
                0,
                {"root_path": str(GDRIVE_MOCK_DIR), "storage_mode": "google_drive_mock"},
            ),
            (
                "storage",
                "system",
                "system",
                "Supabase (Mock)",
                "",
                "",
                "supabase-storage",
                "global",
                "",
                "",
                "inactive",
                0,
                {"root_path": str(SUPABASE_MOCK_DIR), "storage_mode": "supabase_mock"},
            ),
        ]
        for item in defaults:
            cur.execute(
                """
                insert into provider_configs
                (id, provider_type, workspace_profile, credential_scope, name, base_url, api_key, model, region, create_job_path, get_job_path, status, is_default, config_json, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), *item[:-1], json.dumps(item[-1], ensure_ascii=False), timestamp, timestamp),
            )

    if cur.execute("select count(*) from asset_records").fetchone()[0] == 0:
        defaults = [
            ("mail_template", "安全演練預設樣板", "企業內部安全演練郵件樣板", "", {"subject_prefix": "[內部演練]"}),
            ("storyboard_template", "三幕式腳本模板", "開場、辨識、處置", "", {"scene_count": 3}),
            ("avatar", "平台頭像 A", "", "assets/avatar-a.png", {"preview_label": "平台預設頭像"}),
            ("voice", "平台聲音 A", "", "assets/voice-a.wav", {"preview_label": "平台預設聲音"}),
            ("style_preset", "企業培訓風格", "", "", {"tone": "clean"}),
        ]
        for item in defaults:
            cur.execute(
                """
                insert into asset_records
                (id, asset_type, name, content, file_path, status, metadata_json, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), item[0], item[1], item[2], item[3], "active", json.dumps(item[4], ensure_ascii=False), timestamp, timestamp),
            )
    db.commit()


def seed_workspace_profiles(db: sqlite3.Connection) -> None:
    cur = db.cursor()
    timestamp = now()
    if cur.execute("select count(*) from workspace_profiles where profile_key = 'shared'").fetchone()[0] == 0:
        cur.execute(
            """
            insert into workspace_profiles
            (id, profile_key, name, description, source_profile_key, settings_json, status, is_system, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                "shared",
                "shared",
                "平台預設工作設定檔，作為新設定檔的來源模板。",
                None,
                json.dumps(default_workspace_profile_settings(), ensure_ascii=False),
                "active",
                1,
                timestamp,
                timestamp,
            ),
        )

    discovered_keys = {"shared"}
    key_queries = [
        "select distinct workspace_profile as profile_key from projects where workspace_profile is not null and workspace_profile != ''",
        "select distinct workspace_profile as profile_key from provider_configs where workspace_profile is not null and workspace_profile not in ('', 'system')",
        "select distinct workspace_profile as profile_key from storage_policies where workspace_profile is not null and workspace_profile not in ('', 'system')",
    ]
    for query in key_queries:
        rows = cur.execute(query).fetchall()
        for row in rows:
            profile_key = (row["profile_key"] or "").strip().lower()
            if not profile_key or profile_key == "system" or profile_key in discovered_keys:
                continue
            discovered_keys.add(profile_key)
            if cur.execute("select count(*) from workspace_profiles where profile_key = ?", (profile_key,)).fetchone()[0] > 0:
                continue
            cur.execute(
                """
                insert into workspace_profiles
                (id, profile_key, name, description, source_profile_key, settings_json, status, is_system, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    profile_key,
                    profile_key,
                    "由既有資料回填的工作設定檔。",
                    "shared",
                    json.dumps(default_workspace_profile_settings(), ensure_ascii=False),
                    "active",
                    0,
                    timestamp,
                    timestamp,
                ),
            )
    db.commit()


def sync_workspace_profile_settings(db: sqlite3.Connection) -> None:
    rows = db.execute("select * from workspace_profiles").fetchall()
    for row in rows:
        profile = decode_row(row)
        if profile is None:
            continue
        settings = default_workspace_profile_settings()
        settings.update(profile.get("settings_json") or {})

        default_text_provider = db.execute(
            """
            select id
            from provider_configs
            where provider_type = 'text_llm'
              and credential_scope = 'workspace'
              and workspace_profile = ?
              and is_default = 1
            order by updated_at desc
            limit 1
            """,
            (profile["profile_key"],),
        ).fetchone()
        default_video_provider = db.execute(
            """
            select id
            from provider_configs
            where provider_type = 'video_llm'
              and credential_scope = 'workspace'
              and workspace_profile = ?
              and is_default = 1
            order by updated_at desc
            limit 1
            """,
            (profile["profile_key"],),
        ).fetchone()

        if not settings.get("default_text_provider_id") and default_text_provider is not None:
            settings["default_text_provider_id"] = default_text_provider["id"]
        if not settings.get("default_video_provider_id") and default_video_provider is not None:
            settings["default_video_provider_id"] = default_video_provider["id"]

        db.execute(
            "update workspace_profiles set settings_json = ? where id = ?",
            (json.dumps(settings, ensure_ascii=False), profile["id"]),
        )
    db.commit()


def slugify_workspace_profile_key(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    return normalized or "workspace"


def _is_builtin_storage_provider(provider: dict[str, Any]) -> bool:
    if provider.get("provider_type") != "storage":
        return False

    config_json = provider.get("config_json") or {}
    model = provider.get("model") or ""
    storage_mode = str(config_json.get("storage_mode") or "").strip().lower()
    root_path = str(config_json.get("root_path") or "")

    if model == "local-storage-v1":
        return storage_mode == "local" or root_path == str(STORAGE_DIR)

    if model == "google-drive":
        has_real_google_config = bool(config_json.get("folder_id") or config_json.get("service_account_json"))
        if has_real_google_config:
            return False
        return storage_mode == "google_drive_mock" or (
            root_path == str(GDRIVE_MOCK_DIR)
            and not has_real_google_config
        )

    if model == "supabase-storage":
        has_real_supabase_config = bool(
            config_json.get("project_url") or config_json.get("service_role_key") or config_json.get("storage_bucket")
        )
        if has_real_supabase_config:
            return False
        return storage_mode == "supabase_mock" or (
            root_path == str(SUPABASE_MOCK_DIR)
            and not has_real_supabase_config
        )

    return False


def backfill_provider_defaults(db: sqlite3.Connection) -> None:
    cur = db.cursor()
    rows = cur.execute("select * from provider_configs where provider_type = 'storage'").fetchall()
    for row in rows:
        provider = decode_row(row)
        if provider is None:
            continue
        if not _is_builtin_storage_provider(provider):
            continue
        config_json = provider.get("config_json") or {}
        changed = False
        updates: dict[str, Any] = {}

        if provider["model"] == "local-storage-v1":
            if provider["name"] != "Local Storage":
                updates["name"] = "Local Storage"
            if config_json.get("root_path") != str(STORAGE_DIR):
                config_json["root_path"] = str(STORAGE_DIR)
                changed = True
            if config_json.get("storage_mode") != "local":
                config_json["storage_mode"] = "local"
                changed = True
        elif provider["model"] == "google-drive":
            if provider["name"] != "Google Drive (Mock)":
                updates["name"] = "Google Drive (Mock)"
            if config_json.get("root_path") != str(GDRIVE_MOCK_DIR):
                config_json["root_path"] = str(GDRIVE_MOCK_DIR)
                changed = True
            if config_json.get("storage_mode") != "google_drive_mock":
                config_json["storage_mode"] = "google_drive_mock"
                changed = True
        elif provider["model"] == "supabase-storage":
            if provider["name"] != "Supabase (Mock)":
                updates["name"] = "Supabase (Mock)"
            if config_json.get("root_path") != str(SUPABASE_MOCK_DIR):
                config_json["root_path"] = str(SUPABASE_MOCK_DIR)
                changed = True
            if config_json.get("storage_mode") != "supabase_mock":
                config_json["storage_mode"] = "supabase_mock"
                changed = True

        if changed or updates:
            updates["config_json"] = json.dumps(config_json, ensure_ascii=False)
            updates["updated_at"] = now()
            fields = ", ".join(f"{key} = ?" for key in updates)
            cur.execute(
                f"update provider_configs set {fields} where id = ?",
                (*updates.values(), provider["id"]),
            )
    db.commit()


def backfill_provider_scopes(db: sqlite3.Connection) -> None:
    cur = db.cursor()
    rows = cur.execute("select * from provider_configs where provider_type = 'storage'").fetchall()
    for row in rows:
        provider = decode_row(row)
        if provider is None:
            continue

        provider_id = provider["id"]
        workspace_profile = provider.get("workspace_profile") or ""
        credential_scope = provider.get("credential_scope") or ""

        if _is_builtin_storage_provider(provider):
            desired_workspace = "system"
            desired_scope = "system"
        else:
            desired_workspace = workspace_profile if workspace_profile and workspace_profile != "system" else "shared"
            desired_scope = "workspace"

        if workspace_profile != desired_workspace or credential_scope != desired_scope:
            cur.execute(
                """
                update provider_configs
                set workspace_profile = ?, credential_scope = ?
                where id = ?
                """,
                (desired_workspace, desired_scope, provider_id),
            )

        config_json = dict(provider.get("config_json") or {})
        non_builtin_changed = False
        if provider.get("model") == "supabase-storage" and not _is_builtin_storage_provider(provider):
            if config_json.get("storage_mode") == "supabase_mock":
                config_json["storage_mode"] = "supabase"
                non_builtin_changed = True
            if provider.get("name") in {"Supabase (Mock)", "Supabase System"}:
                cur.execute("update provider_configs set name = ?, updated_at = ? where id = ?", ("Supabase", now(), provider_id))
        if provider.get("model") == "google-drive" and not _is_builtin_storage_provider(provider):
            if config_json.get("storage_mode") == "google_drive_mock":
                config_json["storage_mode"] = "google_drive"
                non_builtin_changed = True
            if provider.get("name") in {"Google Drive (Mock)", "Google Drive System"}:
                cur.execute("update provider_configs set name = ?, updated_at = ? where id = ?", ("Google Drive", now(), provider_id))
        if non_builtin_changed:
            cur.execute(
                "update provider_configs set config_json = ?, updated_at = ? where id = ?",
                (json.dumps(config_json, ensure_ascii=False), now(), provider_id),
            )

    cur.execute(
        """
        update provider_configs
        set workspace_profile = 'shared', credential_scope = 'workspace'
        where provider_type != 'storage' and (workspace_profile = '' or workspace_profile is null or credential_scope = '' or credential_scope is null)
        """
    )
    cur.execute(
        """
        update provider_configs
        set workspace_profile = 'shared'
        where provider_type != 'storage' and (workspace_profile = '' or workspace_profile is null)
        """
    )
    cur.execute(
        """
        update provider_configs
        set credential_scope = 'workspace'
        where provider_type != 'storage' and (credential_scope = '' or credential_scope is null)
        """
    )
    db.commit()


def ensure_storage_provider_variants(db: sqlite3.Connection) -> None:
    cur = db.cursor()
    timestamp = now()
    required = [
        ("local-storage-v1", "Local Storage", "local", {"root_path": str(STORAGE_DIR), "storage_mode": "local"}),
        ("google-drive", "Google Drive (Mock)", "inactive", {"root_path": str(GDRIVE_MOCK_DIR), "storage_mode": "google_drive_mock"}),
        ("supabase-storage", "Supabase (Mock)", "inactive", {"root_path": str(SUPABASE_MOCK_DIR), "storage_mode": "supabase_mock"}),
    ]
    for model, name, status, config_json in required:
        rows = cur.execute(
            "select * from provider_configs where provider_type = 'storage' and model = ?",
            (model,),
        ).fetchall()
        has_builtin = any(_is_builtin_storage_provider(provider) for provider in (decode_row(row) for row in rows) if provider is not None)
        if not has_builtin:
            cur.execute(
                """
                insert into provider_configs
                (id, provider_type, workspace_profile, credential_scope, name, base_url, api_key, model, region, create_job_path, get_job_path, status, is_default, config_json, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    "storage",
                    "system",
                    "system",
                    name,
                    "",
                    "",
                    model,
                    "global" if model != "local-storage-v1" else "local",
                    "",
                    "",
                    status,
                    1 if model == "local-storage-v1" else 0,
                    json.dumps(config_json, ensure_ascii=False),
                    timestamp,
                    timestamp,
                ),
            )
    db.commit()


def seed_storage_policy(db: sqlite3.Connection) -> None:
    cur = db.cursor()
    if cur.execute("select count(*) from storage_policies where workspace_profile = 'shared'").fetchone()[0] > 0:
        return

    local_row = cur.execute(
        "select * from provider_configs where provider_type = 'storage' and model = 'local-storage-v1' limit 1"
    ).fetchone()
    local_provider = decode_row(local_row)
    if local_provider is None:
        return

    timestamp = now()
    policy_json = {
        "data_strategy": "supabase_or_local",
        "asset_strategy": "google_drive_or_local",
        "video_strategy": "google_drive_or_local",
        "fallback_strategy": "local_only",
    }
    cur.execute(
        """
        insert into storage_policies
        (id, workspace_profile, policy_scope, data_provider_id, asset_provider_id, video_provider_id, fallback_provider_id, policy_json, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            "shared",
            "system",
            local_provider["id"],
            local_provider["id"],
            local_provider["id"],
            local_provider["id"],
            json.dumps(policy_json, ensure_ascii=False),
            timestamp,
            timestamp,
        ),
    )
    db.commit()
