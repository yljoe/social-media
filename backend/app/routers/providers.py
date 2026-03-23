from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Header, HTTPException

from ..db import connect, decode_row, now
from ..schemas import ApiResponse, ProviderPayload, StoragePolicySelectPayload
from ..services import (
    apply_storage_policy,
    check_provider_health,
    get_provider,
    get_storage_policy,
    list_video_vendor_catalog,
    list_providers_for_workspace,
    normalize_workspace_profile,
    test_provider_connection,
    use_storage_provider,
)


router = APIRouter()


def _payload_dict(payload: ProviderPayload) -> dict:
    return payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()


@router.get("/storage-policy", response_model=ApiResponse)
def storage_policy_detail(x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = normalize_workspace_profile(x_workspace_profile)
    policy = get_storage_policy(workspace_profile)
    return ApiResponse(
        data={
            "policy": policy,
            "data_provider": get_provider(policy["data_provider_id"]),
            "asset_provider": get_provider(policy.get("asset_provider_id") or policy["video_provider_id"]),
            "video_provider": get_provider(policy["video_provider_id"]),
            "fallback_provider": get_provider(policy["fallback_provider_id"]),
        }
    )


@router.post("/storage-policy/apply", response_model=ApiResponse)
def storage_policy_apply(x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = normalize_workspace_profile(x_workspace_profile)
    policy = apply_storage_policy(workspace_profile)
    return ApiResponse(
        message="storage policy applied for new data",
        data={
            "policy": policy,
            "data_provider": get_provider(policy["data_provider_id"]),
            "asset_provider": get_provider(policy.get("asset_provider_id") or policy["video_provider_id"]),
            "video_provider": get_provider(policy["video_provider_id"]),
            "fallback_provider": get_provider(policy["fallback_provider_id"]),
        },
    )


@router.post("/storage-policy/select-provider", response_model=ApiResponse)
def storage_policy_select_provider(
    payload: StoragePolicySelectPayload,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = normalize_workspace_profile(x_workspace_profile)
    policy = use_storage_provider(payload.provider_id, workspace_profile)
    return ApiResponse(
        message="storage provider selected",
        data={
            "policy": policy,
            "data_provider": get_provider(policy["data_provider_id"]),
            "asset_provider": get_provider(policy.get("asset_provider_id") or policy["video_provider_id"]),
            "video_provider": get_provider(policy["video_provider_id"]),
            "fallback_provider": get_provider(policy["fallback_provider_id"]),
        },
    )


@router.get("/providers", response_model=ApiResponse)
def providers_list(x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = normalize_workspace_profile(x_workspace_profile)
    return ApiResponse(data=list_providers_for_workspace(workspace_profile))


@router.get("/providers/video-vendors", response_model=ApiResponse)
def video_vendor_catalog() -> ApiResponse:
    return ApiResponse(data=list_video_vendor_catalog())


@router.get("/providers/{provider_id}/health", response_model=ApiResponse)
def provider_health(provider_id: str, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    provider = get_provider(provider_id, normalize_workspace_profile(x_workspace_profile))
    return ApiResponse(data={"provider": provider, "health": check_provider_health(provider)})


@router.post("/providers/test", response_model=ApiResponse)
def provider_connection_test(payload: ProviderPayload, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = normalize_workspace_profile(x_workspace_profile)
    provider = {
        **_payload_dict(payload),
        "workspace_profile": workspace_profile,
        "credential_scope": "workspace",
    }
    return ApiResponse(message="provider connection tested", data=test_provider_connection(provider))


@router.post("/providers/{provider_id}/test", response_model=ApiResponse)
def saved_provider_connection_test(provider_id: str, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    provider = get_provider(provider_id, normalize_workspace_profile(x_workspace_profile))
    return ApiResponse(message="provider connection tested", data=test_provider_connection(provider))


@router.post("/providers", response_model=ApiResponse)
def providers_create(payload: ProviderPayload, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = normalize_workspace_profile(x_workspace_profile)
    if payload.provider_type == "storage" and payload.model not in {"google-drive", "supabase-storage"}:
        raise HTTPException(status_code=400, detail="Only Google Drive and Supabase Storage can be managed from the UI. SQL and system storage stay in server configuration.")

    db = connect()
    if payload.is_default:
        db.execute(
            """
            update provider_configs
            set is_default = 0
            where provider_type = ? and credential_scope = 'workspace' and workspace_profile = ?
            """,
            (payload.provider_type, workspace_profile),
        )

    provider_id = str(uuid.uuid4())
    timestamp = now()
    db.execute(
        """
        insert into provider_configs
        (id, provider_type, workspace_profile, credential_scope, name, base_url, api_key, model, region, create_job_path, get_job_path, status, is_default, config_json, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            provider_id,
            payload.provider_type,
            workspace_profile,
            "workspace",
            payload.name,
            payload.base_url,
            payload.api_key,
            payload.model,
            payload.region,
            payload.create_job_path,
            payload.get_job_path,
            payload.status,
            1 if payload.is_default else 0,
            json.dumps(payload.config_json, ensure_ascii=False),
            timestamp,
            timestamp,
        ),
    )
    db.commit()
    row = db.execute("select * from provider_configs where id = ?", (provider_id,)).fetchone()
    db.close()
    return ApiResponse(message="provider created", data=decode_row(row))


@router.put("/providers/{provider_id}", response_model=ApiResponse)
def providers_update(
    provider_id: str,
    payload: ProviderPayload,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = normalize_workspace_profile(x_workspace_profile)
    db = connect()
    existing = db.execute("select * from provider_configs where id = ?", (provider_id,)).fetchone()
    if existing is None:
        db.close()
        raise HTTPException(status_code=404, detail="provider not found")
    existing_provider = decode_row(existing)
    if existing_provider is None:
        db.close()
        raise HTTPException(status_code=404, detail="provider not found")
    if existing_provider.get("credential_scope") == "system":
        db.close()
        raise HTTPException(status_code=403, detail="system-managed provider cannot be edited from the UI")
    if normalize_workspace_profile(existing_provider.get("workspace_profile")) != workspace_profile:
        db.close()
        raise HTTPException(status_code=404, detail="provider not found")
    if payload.provider_type == "storage" and payload.model not in {"google-drive", "supabase-storage"}:
        db.close()
        raise HTTPException(status_code=400, detail="Only Google Drive and Supabase Storage can be managed from the UI. SQL and system storage stay in server configuration.")
    if payload.is_default:
        db.execute(
            """
            update provider_configs
            set is_default = 0
            where provider_type = ? and credential_scope = 'workspace' and workspace_profile = ?
            """,
            (payload.provider_type, workspace_profile),
        )

    db.execute(
        """
        update provider_configs
        set provider_type = ?, name = ?, base_url = ?, api_key = ?, model = ?, region = ?, create_job_path = ?, get_job_path = ?, status = ?, is_default = ?, config_json = ?, updated_at = ?
        where id = ?
        """,
        (
            payload.provider_type,
            payload.name,
            payload.base_url,
            payload.api_key,
            payload.model,
            payload.region,
            payload.create_job_path,
            payload.get_job_path,
            payload.status,
            1 if payload.is_default else 0,
            json.dumps(payload.config_json, ensure_ascii=False),
            now(),
            provider_id,
        ),
    )
    db.commit()
    row = db.execute("select * from provider_configs where id = ?", (provider_id,)).fetchone()
    db.close()
    return ApiResponse(message="provider updated", data=decode_row(row))


@router.delete("/providers/{provider_id}", response_model=ApiResponse)
def providers_delete(provider_id: str, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = normalize_workspace_profile(x_workspace_profile)
    db = connect()
    existing = db.execute("select * from provider_configs where id = ?", (provider_id,)).fetchone()
    if existing is None:
        db.close()
        raise HTTPException(status_code=404, detail="provider not found")
    existing_provider = decode_row(existing)
    if existing_provider is None:
        db.close()
        raise HTTPException(status_code=404, detail="provider not found")
    if existing_provider.get("credential_scope") == "system":
        db.close()
        raise HTTPException(status_code=403, detail="system-managed provider cannot be deleted from the UI")
    if normalize_workspace_profile(existing_provider.get("workspace_profile")) != workspace_profile:
        db.close()
        raise HTTPException(status_code=404, detail="provider not found")
    should_reapply_storage_policy = existing_provider.get("provider_type") == "storage"
    db.execute("delete from provider_configs where id = ?", (provider_id,))
    db.commit()
    db.close()
    if should_reapply_storage_policy:
        apply_storage_policy(workspace_profile)
    return ApiResponse(message="provider deleted", data={"id": provider_id})
