from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException

from ..db import connect, decode_row, now, slugify_workspace_profile_key
from ..schemas import ApiResponse, WorkspaceProfileCreate, WorkspaceProfileUpdate
from ..services import apply_storage_policy


router = APIRouter()


def _profile_with_counts(row) -> dict | None:
    item = decode_row(row)
    if item is None:
        return None
    db = connect()
    item["project_count"] = db.execute("select count(*) from projects where workspace_profile = ?", (item["profile_key"],)).fetchone()[0]
    item["provider_count"] = db.execute(
        """
        select count(*)
        from provider_configs
        where credential_scope = 'workspace' and workspace_profile = ?
        """,
        (item["profile_key"],),
    ).fetchone()[0]
    db.close()
    return item


def _get_profile_by_id(profile_id: str) -> dict:
    db = connect()
    row = db.execute("select * from workspace_profiles where id = ?", (profile_id,)).fetchone()
    db.close()
    item = _profile_with_counts(row)
    if item is None:
        raise HTTPException(status_code=404, detail="workspace profile not found")
    return item


def _get_profile_by_key(profile_key: str) -> dict:
    db = connect()
    row = db.execute("select * from workspace_profiles where profile_key = ?", (profile_key,)).fetchone()
    db.close()
    item = _profile_with_counts(row)
    if item is None:
        raise HTTPException(status_code=404, detail="workspace profile not found")
    return item


def _next_profile_key(db, base_key: str) -> str:
    candidate = base_key
    index = 2
    while db.execute("select count(*) from workspace_profiles where profile_key = ?", (candidate,)).fetchone()[0] > 0:
        candidate = f"{base_key}-{index}"
        index += 1
    return candidate


@router.get("/workspace-profiles", response_model=ApiResponse)
def workspace_profiles_list() -> ApiResponse:
    db = connect()
    rows = db.execute(
        """
        select *
        from workspace_profiles
        order by
          case
            when profile_key = 'shared' then 0
            when is_system = 1 then 1
            else 2
          end asc,
          updated_at desc
        """
    ).fetchall()
    db.close()
    return ApiResponse(data=[item for row in rows if (item := _profile_with_counts(row)) is not None])


@router.post("/workspace-profiles", response_model=ApiResponse)
def workspace_profiles_create(payload: WorkspaceProfileCreate) -> ApiResponse:
    source_profile = _get_profile_by_key(payload.source_profile_key)
    db = connect()
    timestamp = now()
    profile_key = _next_profile_key(db, slugify_workspace_profile_key(payload.name))
    profile_id = str(uuid.uuid4())
    settings_json = payload.settings_json.model_dump()
    db.execute(
        """
        insert into workspace_profiles
        (id, profile_key, name, description, source_profile_key, settings_json, status, is_system, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            profile_id,
            profile_key,
            payload.name.strip(),
            payload.description.strip(),
            source_profile["profile_key"],
            json.dumps(settings_json, ensure_ascii=False),
            "active",
            0,
            timestamp,
            timestamp,
        ),
    )

    provider_id_map: dict[str, str] = {}
    source_rows = db.execute(
        """
        select *
        from provider_configs
        where credential_scope = 'workspace' and workspace_profile = ?
        order by provider_type asc, updated_at desc
        """,
        (source_profile["profile_key"],),
    ).fetchall()
    for row in source_rows:
        provider = decode_row(row)
        if provider is None:
            continue
        new_provider_id = str(uuid.uuid4())
        provider_id_map[provider["id"]] = new_provider_id
        db.execute(
            """
            insert into provider_configs
            (id, provider_type, workspace_profile, credential_scope, name, base_url, api_key, model, region, create_job_path, get_job_path, status, is_default, config_json, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_provider_id,
                provider["provider_type"],
                profile_key,
                "workspace",
                provider["name"],
                provider["base_url"],
                provider["api_key"],
                provider["model"],
                provider["region"],
                provider["create_job_path"],
                provider["get_job_path"],
                provider["status"],
                provider["is_default"],
                json.dumps(provider.get("config_json") or {}, ensure_ascii=False),
                timestamp,
                timestamp,
            ),
        )

    for key in ("default_text_provider_id", "default_video_provider_id"):
        provider_id = str(settings_json.get(key) or "").strip()
        if provider_id and provider_id in provider_id_map:
            settings_json[key] = provider_id_map[provider_id]

    db.execute(
        "update workspace_profiles set settings_json = ?, updated_at = ? where id = ?",
        (json.dumps(settings_json, ensure_ascii=False), timestamp, profile_id),
    )

    db.commit()
    db.close()
    apply_storage_policy(profile_key)
    return ApiResponse(message="workspace profile created", data=_get_profile_by_id(profile_id))


@router.put("/workspace-profiles/{profile_id}", response_model=ApiResponse)
def workspace_profiles_update(profile_id: str, payload: WorkspaceProfileUpdate) -> ApiResponse:
    existing = _get_profile_by_id(profile_id)
    if existing["is_system"] == 1:
        raise HTTPException(status_code=403, detail="system workspace profile cannot be edited")
    db = connect()
    db.execute(
        """
        update workspace_profiles
        set name = ?, description = ?, settings_json = ?, updated_at = ?
        where id = ?
        """,
        (payload.name.strip(), payload.description.strip(), json.dumps(payload.settings_json.model_dump(), ensure_ascii=False), now(), profile_id),
    )
    db.commit()
    db.close()
    return ApiResponse(message="workspace profile updated", data=_get_profile_by_id(profile_id))


@router.delete("/workspace-profiles/{profile_id}", response_model=ApiResponse)
def workspace_profiles_delete(profile_id: str) -> ApiResponse:
    existing = _get_profile_by_id(profile_id)
    if existing["is_system"] == 1:
        raise HTTPException(status_code=403, detail="system workspace profile cannot be deleted")
    if existing["project_count"] > 0:
        raise HTTPException(status_code=400, detail="workspace profile is still used by projects")

    db = connect()
    db.execute("delete from provider_configs where credential_scope = 'workspace' and workspace_profile = ?", (existing["profile_key"],))
    db.execute("delete from storage_policies where workspace_profile = ?", (existing["profile_key"],))
    db.execute("delete from storage_bindings where workspace_profile = ?", (existing["profile_key"],))
    db.execute("delete from workspace_profiles where id = ?", (profile_id,))
    db.commit()
    db.close()
    return ApiResponse(message="workspace profile deleted", data={"id": profile_id, "profile_key": existing["profile_key"]})
