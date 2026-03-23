from __future__ import annotations

import json
import mimetypes
import shutil
import uuid
from pathlib import Path, PurePosixPath
from typing import Any

from fastapi import HTTPException

from ..db import connect, decode_row, now
from .provider_service import (
    _provider_mode,
    _provider_root,
    _upload_to_google_drive,
    _upload_to_supabase_storage,
    _upsert_supabase_metadata,
    get_provider,
    list_providers_for_workspace,
    log_provider_call,
    normalize_workspace_profile,
    storage_provider_is_ready,
)


STORAGE_ROLE_DOCUMENT = "document"
STORAGE_ROLE_ASSET = "asset"
STORAGE_ROLE_VIDEO = "video"


def _policy_provider_ids(item: dict[str, Any]) -> dict[str, str]:
    return {
        "document": item["data_provider_id"],
        "asset": item.get("asset_provider_id") or item["video_provider_id"],
        "video": item["video_provider_id"],
        "fallback": item["fallback_provider_id"],
    }


def _provider_for_role_from_binding(binding: dict[str, Any], role: str) -> dict[str, Any]:
    detail_json = binding.get("detail_json") or {}
    if role == STORAGE_ROLE_VIDEO:
        provider_id = detail_json.get("video_provider_id") or binding["provider_id"]
    elif role == STORAGE_ROLE_ASSET:
        provider_id = detail_json.get("asset_provider_id") or detail_json.get("video_provider_id") or binding["provider_id"]
    else:
        provider_id = detail_json.get("document_provider_id") or binding["provider_id"]
    return get_provider(provider_id)


def _storage_role_for_provider(provider: dict[str, Any]) -> tuple[set[str], str]:
    model = provider.get("model")
    if model == "supabase-storage":
        return {STORAGE_ROLE_DOCUMENT}, "documents_only"
    if model == "google-drive":
        return {STORAGE_ROLE_ASSET, STORAGE_ROLE_VIDEO}, "assets_and_video"
    if model == "local-storage-v1":
        return {STORAGE_ROLE_DOCUMENT, STORAGE_ROLE_ASSET, STORAGE_ROLE_VIDEO}, "local_all"
    return {STORAGE_ROLE_DOCUMENT}, "documents_only"


def _storage_role_from_relative_path(relative_path: str) -> str:
    normalized = relative_path.replace("\\", "/").lower()
    if normalized.startswith("video/") or normalized.startswith("scenes/"):
        return STORAGE_ROLE_VIDEO
    if normalized.startswith("asset_uploads/"):
        return STORAGE_ROLE_ASSET
    return STORAGE_ROLE_DOCUMENT


def get_storage_binding(project_id: str, workspace_profile: str | None = None) -> dict[str, Any] | None:
    normalized = normalize_workspace_profile(workspace_profile)
    db = connect()
    row = db.execute(
        "select * from storage_bindings where project_id = ? and workspace_profile = ?",
        (project_id, normalized),
    ).fetchone()
    db.close()
    return decode_row(row)


def get_storage_policy(workspace_profile: str | None = None) -> dict[str, Any]:
    normalized = normalize_workspace_profile(workspace_profile)
    db = connect()
    row = db.execute(
        """
        select * from storage_policies
        where workspace_profile = ? or policy_scope = 'system'
        order by
          case
            when policy_scope = 'workspace' and workspace_profile = ? then 0
            else 1
          end asc,
          updated_at desc
        limit 1
        """,
        (normalized, normalized),
    ).fetchone()
    db.close()
    item = decode_row(row)
    if item is None:
        raise HTTPException(status_code=400, detail="storage policy not configured")
    return item


def apply_storage_policy(workspace_profile: str | None = None) -> dict[str, Any]:
    normalized = normalize_workspace_profile(workspace_profile)
    db = connect()
    providers = list_providers_for_workspace(normalized, "storage")

    local_provider = next((provider for provider in providers if provider["model"] == "local-storage-v1"), None)
    google_provider = next(
        (
            provider
            for provider in providers
            if provider["model"] == "google-drive" and provider["status"] == "active" and storage_provider_is_ready(provider)[0]
        ),
        None,
    )
    supabase_provider = next(
        (
            provider
            for provider in providers
            if provider["model"] == "supabase-storage" and provider["status"] == "active" and storage_provider_is_ready(provider)[0]
        ),
        None,
    )
    if local_provider is None:
        db.close()
        raise HTTPException(status_code=400, detail="local storage provider not configured")

    data_provider = supabase_provider or local_provider
    asset_provider = google_provider or local_provider
    video_provider = google_provider or local_provider
    fallback_provider = local_provider
    policy_json = {
        "document_strategy": "supabase_or_local",
        "asset_strategy": "google_drive_or_local",
        "video_strategy": "google_drive_or_local",
        "fallback_strategy": "local_only",
        "resolved": {
            "document_provider_id": data_provider["id"],
            "asset_provider_id": asset_provider["id"],
            "video_provider_id": video_provider["id"],
            "data_provider_model": data_provider["model"],
            "document_provider_model": data_provider["model"],
            "asset_provider_model": asset_provider["model"],
            "video_provider_model": video_provider["model"],
            "fallback_provider_model": fallback_provider["model"],
        },
    }
    row = db.execute(
        "select * from storage_policies where workspace_profile = ? limit 1",
        (normalized,),
    ).fetchone()
    timestamp = now()
    policy_scope = "workspace" if normalized != "shared" else "system"
    if row is None:
        policy_id = str(uuid.uuid4())
        db.execute(
            """
            insert into storage_policies
            (id, workspace_profile, policy_scope, data_provider_id, asset_provider_id, video_provider_id, fallback_provider_id, policy_json, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                policy_id,
                normalized,
                policy_scope,
                data_provider["id"],
                asset_provider["id"],
                video_provider["id"],
                fallback_provider["id"],
                json.dumps(policy_json, ensure_ascii=False),
                timestamp,
                timestamp,
            ),
        )
    else:
        existing = decode_row(row)
        db.execute(
            """
            update storage_policies
            set policy_scope = ?, data_provider_id = ?, asset_provider_id = ?, video_provider_id = ?, fallback_provider_id = ?, policy_json = ?, updated_at = ?
            where id = ?
            """,
            (
                policy_scope,
                data_provider["id"],
                asset_provider["id"],
                video_provider["id"],
                fallback_provider["id"],
                json.dumps(policy_json, ensure_ascii=False),
                timestamp,
                existing["id"],
            ),
        )
    db.commit()
    db.close()
    return get_storage_policy(normalized)


def use_storage_provider(provider_id: str, workspace_profile: str | None = None) -> dict[str, Any]:
    normalized = normalize_workspace_profile(workspace_profile)
    provider = get_provider(provider_id, normalized)
    if provider.get("provider_type") != "storage":
        raise HTTPException(status_code=400, detail="provider must be a storage provider")

    ready, reason = storage_provider_is_ready(provider)
    if not ready:
        raise HTTPException(status_code=400, detail=f"storage provider is not ready: {reason}")

    providers = list_providers_for_workspace(normalized, "storage")
    local_provider = next((item for item in providers if item["model"] == "local-storage-v1"), None)
    if local_provider is None:
        raise HTTPException(status_code=400, detail="local storage provider not configured")

    db = connect()
    timestamp = now()
    existing_row = db.execute("select * from storage_policies where workspace_profile = ? limit 1", (normalized,)).fetchone()
    existing = decode_row(existing_row) if existing_row else None
    existing_provider_ids = _policy_provider_ids(existing) if existing else {
        "document": local_provider["id"],
        "asset": local_provider["id"],
        "video": local_provider["id"],
        "fallback": local_provider["id"],
    }
    supported_roles, strategy = _storage_role_for_provider(provider)
    document_provider_id = provider["id"] if STORAGE_ROLE_DOCUMENT in supported_roles else existing_provider_ids["document"]
    asset_provider_id = provider["id"] if STORAGE_ROLE_ASSET in supported_roles else existing_provider_ids["asset"]
    video_provider_id = provider["id"] if STORAGE_ROLE_VIDEO in supported_roles else existing_provider_ids["video"]
    policy_json = {
        "document_strategy": strategy if STORAGE_ROLE_DOCUMENT in supported_roles else "retained",
        "asset_strategy": strategy if STORAGE_ROLE_ASSET in supported_roles else "retained",
        "video_strategy": strategy if STORAGE_ROLE_VIDEO in supported_roles else "retained",
        "fallback_strategy": "local_only",
        "resolved": {
            "selected_provider_id": provider["id"],
            "selected_provider_model": provider["model"],
            "document_provider_id": document_provider_id,
            "asset_provider_id": asset_provider_id,
            "video_provider_id": video_provider_id,
            "data_provider_model": get_provider(document_provider_id)["model"],
            "document_provider_model": get_provider(document_provider_id)["model"],
            "asset_provider_model": get_provider(asset_provider_id)["model"],
            "video_provider_model": get_provider(video_provider_id)["model"],
            "fallback_provider_model": local_provider["model"],
        },
    }
    policy_scope = "workspace" if normalized != "shared" else "system"
    if existing is None:
        db.execute(
            """
            insert into storage_policies
            (id, workspace_profile, policy_scope, data_provider_id, asset_provider_id, video_provider_id, fallback_provider_id, policy_json, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                normalized,
                policy_scope,
                document_provider_id,
                asset_provider_id,
                video_provider_id,
                local_provider["id"],
                json.dumps(policy_json, ensure_ascii=False),
                timestamp,
                timestamp,
            ),
        )
    else:
        db.execute(
            """
            update storage_policies
            set policy_scope = ?, data_provider_id = ?, asset_provider_id = ?, video_provider_id = ?, fallback_provider_id = ?, policy_json = ?, updated_at = ?
            where id = ?
            """,
            (
                policy_scope,
                document_provider_id,
                asset_provider_id,
                video_provider_id,
                local_provider["id"],
                json.dumps(policy_json, ensure_ascii=False),
                timestamp,
                existing["id"],
            ),
        )
    db.commit()
    db.close()
    return get_storage_policy(normalized)


def ensure_storage_binding(project_id: str, workspace_profile: str | None = None) -> dict[str, Any]:
    normalized = normalize_workspace_profile(workspace_profile)
    existing = get_storage_binding(project_id, normalized)
    if existing is not None:
        return existing

    storage_policy = get_storage_policy(normalized)
    data_provider = get_provider(storage_policy["data_provider_id"])
    asset_provider = get_provider(storage_policy.get("asset_provider_id") or storage_policy["video_provider_id"])
    video_provider = get_provider(storage_policy["video_provider_id"])
    fallback_provider = get_provider(storage_policy["fallback_provider_id"])
    root_base = _provider_root(data_provider)
    asset_root_base = _provider_root(asset_provider)
    video_root_base = _provider_root(video_provider)
    binding = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "workspace_profile": normalized,
        "provider_id": data_provider["id"],
        "root_path": str(root_base / project_id),
        "mode": _provider_mode(data_provider),
        "detail_json": {
            "provider_name": data_provider["name"],
            "provider_model": data_provider["model"],
            "document_provider_id": data_provider["id"],
            "document_provider_name": data_provider["name"],
            "document_provider_model": data_provider["model"],
            "base_root_path": str(root_base),
            "asset_provider_id": asset_provider["id"],
            "asset_provider_name": asset_provider["name"],
            "asset_provider_model": asset_provider["model"],
            "asset_root_path": str(asset_root_base / project_id),
            "asset_base_root_path": str(asset_root_base),
            "asset_mode": _provider_mode(asset_provider),
            "video_provider_id": video_provider["id"],
            "video_provider_name": video_provider["name"],
            "video_provider_model": video_provider["model"],
            "video_root_path": str(video_root_base / project_id),
            "video_base_root_path": str(video_root_base),
            "video_mode": _provider_mode(video_provider),
            "fallback_provider_id": fallback_provider["id"],
            "fallback_provider_name": fallback_provider["name"],
            "fallback_provider_model": fallback_provider["model"],
            "policy_id": storage_policy["id"],
        },
        "created_at": now(),
        "updated_at": now(),
    }

    db = connect()
    db.execute(
        """
        insert into storage_bindings (id, project_id, workspace_profile, provider_id, root_path, mode, detail_json, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            binding["id"],
            binding["project_id"],
            binding["workspace_profile"],
            binding["provider_id"],
            binding["root_path"],
            binding["mode"],
            json.dumps(binding["detail_json"], ensure_ascii=False),
            binding["created_at"],
            binding["updated_at"],
        ),
    )
    db.commit()
    db.close()
    return get_storage_binding(project_id, normalized) or binding


def get_project_dir(project_id: str, workspace_profile: str | None = None) -> Path:
    binding = ensure_storage_binding(project_id, workspace_profile)
    project_dir = Path(binding["root_path"])
    for folder in ("input", "text", "scenes", "video", "control"):
        (project_dir / folder).mkdir(parents=True, exist_ok=True)
    return project_dir


def get_asset_project_dir(project_id: str, workspace_profile: str | None = None) -> Path:
    binding = ensure_storage_binding(project_id, workspace_profile)
    detail_json = binding.get("detail_json") or {}
    asset_root_path = detail_json.get("asset_root_path") or detail_json.get("video_root_path") or binding["root_path"]
    project_dir = Path(asset_root_path)
    for folder in ("input", "assets", "uploads", "references"):
        (project_dir / folder).mkdir(parents=True, exist_ok=True)
    return project_dir


def get_video_project_dir(project_id: str, workspace_profile: str | None = None) -> Path:
    binding = ensure_storage_binding(project_id, workspace_profile)
    detail_json = binding.get("detail_json") or {}
    video_root_path = detail_json.get("video_root_path") or binding["root_path"]
    project_dir = Path(video_root_path)
    for folder in ("scenes", "video", "control"):
        (project_dir / folder).mkdir(parents=True, exist_ok=True)
    return project_dir


def _log_provider_event(
    provider_id: str,
    provider_type: str,
    project_id: str,
    action: str,
    request_payload: dict[str, Any],
    response_payload: dict[str, Any] | None,
    status: str,
    error_message: str = "",
) -> None:
    db = connect()
    log_provider_call(
        db,
        provider_id,
        provider_type,
        project_id,
        action,
        request_payload,
        response_payload,
        status,
        error_message,
    )
    db.commit()
    db.close()


def sync_storage_artifact(project_id: str, relative_path: str, local_path: Path, role: str, workspace_profile: str | None = None) -> None:
    binding = ensure_storage_binding(project_id, workspace_profile)
    provider = _provider_for_role_from_binding(binding, role)

    if provider["provider_type"] != "storage":
        return

    try:
        if provider["model"] == "google-drive":
            result = _upload_to_google_drive(provider, project_id, relative_path, local_path)
            _log_provider_event(
                provider["id"],
                provider["provider_type"],
                project_id,
                "storage.upload.google_drive",
                {"relative_path": relative_path, "role": role},
                result,
                "completed",
            )
        elif provider["model"] == "supabase-storage":
            storage_result = _upload_to_supabase_storage(provider, project_id, relative_path, local_path)
            metadata_result = _upsert_supabase_metadata(provider, project_id, relative_path, local_path)
            _log_provider_event(
                provider["id"],
                provider["provider_type"],
                project_id,
                "storage.upload.supabase",
                {"relative_path": relative_path, "role": role},
                {"storage": storage_result, "metadata": metadata_result},
                "completed",
            )
    except Exception as exc:  # pragma: no cover - network/credential dependent
        _log_provider_event(
            provider["id"],
            provider["provider_type"],
            project_id,
            "storage.upload",
            {"relative_path": relative_path, "role": role},
            {"fallback": "local_only"},
            "fallback_local",
            str(exc),
        )


def rebind_project_storage(project_id: str, provider_id: str, move_existing_files: bool = True, workspace_profile: str | None = None) -> dict[str, Any]:
    normalized = normalize_workspace_profile(workspace_profile)
    existing = ensure_storage_binding(project_id, normalized)
    provider = get_provider(provider_id, normalized)
    if provider.get("provider_type") != "storage":
        raise HTTPException(status_code=400, detail="provider must be a storage provider")

    config_json = provider.get("config_json") or {}
    root_base = Path(config_json.get("root_path") or existing["root_path"]).parent
    new_root = _provider_root(provider) / project_id
    old_root = Path(existing["root_path"])

    if move_existing_files and old_root.exists() and old_root != new_root:
        new_root.mkdir(parents=True, exist_ok=True)
        for path in old_root.rglob("*"):
            if path.is_file():
                target = new_root / path.relative_to(old_root)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)

    timestamp = now()
    db = connect()
    db.execute(
        """
        update storage_bindings
        set provider_id = ?, root_path = ?, mode = ?, detail_json = ?, updated_at = ?
        where project_id = ? and workspace_profile = ?
        """,
        (
            provider["id"],
            str(new_root),
            config_json.get("storage_mode") or ("google_drive_mock" if provider.get("model") == "google-drive" else "local"),
            json.dumps(
                {
                    "provider_name": provider["name"],
                    "provider_model": provider["model"],
                    "base_root_path": str(root_base),
                    "copied_from": str(old_root),
                },
                ensure_ascii=False,
            ),
            timestamp,
            project_id,
            normalized,
        ),
    )
    db.commit()
    db.close()
    return ensure_storage_binding(project_id, normalized)


def write_artifact(project_id: str, relative_path: str, payload: Any, workspace_profile: str | None = None) -> str:
    role = _storage_role_from_relative_path(relative_path)
    project_dir = get_video_project_dir(project_id, workspace_profile) if role == STORAGE_ROLE_VIDEO else get_project_dir(project_id, workspace_profile)
    path = project_dir / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(payload, (dict, list)):
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        path.write_text(str(payload), encoding="utf-8")
    sync_storage_artifact(project_id, relative_path, path, role, workspace_profile)
    return str(path)


def sync_workspace_asset_artifact(relative_path: str, local_path: Path, workspace_profile: str | None = None) -> None:
    normalized = normalize_workspace_profile(workspace_profile)
    storage_policy = get_storage_policy(normalized)
    provider = get_provider(storage_policy.get("asset_provider_id") or storage_policy["video_provider_id"])
    if provider["provider_type"] != "storage":
        return

    library_id = f"_workspace_assets_{normalized}"
    try:
        if provider["model"] == "google-drive":
            result = _upload_to_google_drive(provider, library_id, relative_path, local_path)
            _log_provider_event(
                provider["id"],
                provider["provider_type"],
                library_id,
                "storage.upload.asset_library.google_drive",
                {"relative_path": relative_path, "role": STORAGE_ROLE_ASSET},
                result,
                "completed",
            )
        elif provider["model"] == "supabase-storage":
            storage_result = _upload_to_supabase_storage(provider, library_id, relative_path, local_path)
            metadata_result = _upsert_supabase_metadata(provider, library_id, relative_path, local_path)
            _log_provider_event(
                provider["id"],
                provider["provider_type"],
                library_id,
                "storage.upload.asset_library.supabase",
                {"relative_path": relative_path, "role": STORAGE_ROLE_ASSET},
                {"storage": storage_result, "metadata": metadata_result},
                "completed",
            )
    except Exception as exc:  # pragma: no cover - network/credential dependent
        _log_provider_event(
            provider["id"],
            provider["provider_type"],
            library_id,
            "storage.upload.asset_library",
            {"relative_path": relative_path, "role": STORAGE_ROLE_ASSET},
            {"fallback": "local_only"},
            "fallback_local",
            str(exc),
        )


def list_files(project_id: str, workspace_profile: str | None = None) -> list[dict[str, Any]]:
    data_dir = get_project_dir(project_id, workspace_profile)
    video_dir = get_video_project_dir(project_id, workspace_profile)
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for root in [data_dir, video_dir]:
        for path in sorted(root.rglob("*")):
            if path.is_file():
                relative_path = str(path.relative_to(root)).replace("\\", "/")
                if relative_path in seen:
                    continue
                seen.add(relative_path)
                items.append(
                    {
                        "relative_path": relative_path,
                        "size": path.stat().st_size,
                        "modified_at": path.stat().st_mtime,
                    }
                )
    return items


def _normalize_relative_path(relative_path: str) -> str:
    candidate = PurePosixPath(relative_path.replace("\\", "/"))
    if candidate.is_absolute() or ".." in candidate.parts or str(candidate) in {"", "."}:
        raise HTTPException(status_code=400, detail="invalid relative path")
    return str(candidate)


def _candidate_project_file_paths(project_id: str, relative_path: str, workspace_profile: str | None = None) -> list[Path]:
    normalized = _normalize_relative_path(relative_path)
    return [
        get_project_dir(project_id, workspace_profile) / normalized,
        get_video_project_dir(project_id, workspace_profile) / normalized,
    ]


def resolve_project_file(project_id: str, relative_path: str, workspace_profile: str | None = None) -> Path:
    for path in _candidate_project_file_paths(project_id, relative_path, workspace_profile):
        if path.exists() and path.is_file():
            return path
    raise HTTPException(status_code=404, detail="file not found")


def read_project_file(project_id: str, relative_path: str, workspace_profile: str | None = None) -> dict[str, Any]:
    path = resolve_project_file(project_id, relative_path, workspace_profile)
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    suffix = path.suffix.lower()
    is_text = suffix in {".json", ".txt", ".md", ".html", ".htm", ".srt", ".csv", ".log", ".xml", ".yaml", ".yml"}
    content = None
    if is_text:
        content = path.read_text(encoding="utf-8")
    return {
        "relative_path": _normalize_relative_path(relative_path),
        "size": path.stat().st_size,
        "modified_at": path.stat().st_mtime,
        "mime_type": mime_type,
        "is_text": is_text,
        "content": content,
    }


def update_project_file(project_id: str, relative_path: str, content: str, workspace_profile: str | None = None) -> dict[str, Any]:
    path = resolve_project_file(project_id, relative_path, workspace_profile)
    suffix = path.suffix.lower()
    if suffix not in {".json", ".txt", ".md", ".html", ".htm", ".srt", ".csv", ".log", ".xml", ".yaml", ".yml"}:
        raise HTTPException(status_code=400, detail="file type is not editable")
    path.write_text(content, encoding="utf-8")
    return read_project_file(project_id, relative_path, workspace_profile)


def rename_project_file(project_id: str, relative_path: str, new_relative_path: str, workspace_profile: str | None = None) -> dict[str, Any]:
    source = resolve_project_file(project_id, relative_path, workspace_profile)
    normalized_target = _normalize_relative_path(new_relative_path)
    candidate_roots = [
        get_project_dir(project_id, workspace_profile),
        get_video_project_dir(project_id, workspace_profile),
    ]
    root = next((item for item in candidate_roots if source.is_relative_to(item)), source.parent)
    target = root / normalized_target
    target.parent.mkdir(parents=True, exist_ok=True)
    source.rename(target)
    return {
        "old_relative_path": _normalize_relative_path(relative_path),
        "relative_path": normalized_target,
        "size": target.stat().st_size,
        "modified_at": target.stat().st_mtime,
    }


def delete_project_file(project_id: str, relative_path: str, workspace_profile: str | None = None) -> dict[str, Any]:
    path = resolve_project_file(project_id, relative_path, workspace_profile)
    normalized = _normalize_relative_path(relative_path)
    path.unlink(missing_ok=False)
    parent = path.parent
    while parent.name and parent.name not in {project_id, ""}:
        if any(parent.iterdir()):
            break
        parent.rmdir()
        parent = parent.parent
    return {"relative_path": normalized, "deleted": True}
