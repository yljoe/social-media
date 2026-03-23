from __future__ import annotations

import json
import mimetypes
import time
import uuid
from pathlib import Path
from typing import Any
from urllib import error, parse, request

import requests
from fastapi import HTTPException

from ..config import STORAGE_DIR
from ..db import connect, decode_row, now
from .video_vendor_adapters import (
    build_video_connection_probe,
    build_video_create_request,
    build_video_poll_request,
    normalize_video_job,
)
from .video_vendor_registry import (
    apply_video_vendor_defaults,
    build_video_auth_headers,
    build_video_provider_url,
    extract_job_id,
    resolve_video_vendor,
)

try:
    from google.auth.transport.requests import Request as GoogleAuthRequest
    from google.oauth2 import service_account
except ImportError:  # pragma: no cover - optional dependency in local dev
    GoogleAuthRequest = None
    service_account = None


SYSTEM_WORKSPACE_PROFILE = "system"
SHARED_WORKSPACE_PROFILE = "shared"


def normalize_workspace_profile(workspace_profile: str | None) -> str:
    value = (workspace_profile or SHARED_WORKSPACE_PROFILE).strip().lower()
    return value or SHARED_WORKSPACE_PROFILE


def provider_visible_in_workspace(provider: dict[str, Any], workspace_profile: str | None) -> bool:
    normalized = normalize_workspace_profile(workspace_profile)
    if provider.get("credential_scope") == "system":
        return True
    return normalize_workspace_profile(provider.get("workspace_profile")) == normalized


def list_providers_for_workspace(workspace_profile: str | None, provider_type: str | None = None) -> list[dict[str, Any]]:
    normalized = normalize_workspace_profile(workspace_profile)
    db = connect()
    query = """
        select * from provider_configs
        where credential_scope = 'system' or workspace_profile = ?
    """
    params: list[Any] = [normalized]
    if provider_type:
        query += " and provider_type = ?"
        params.append(provider_type)
    query += " order by provider_type asc, credential_scope asc, updated_at desc"
    rows = db.execute(query, tuple(params)).fetchall()
    db.close()
    return [item for row in rows if (item := decode_row(row)) is not None]


def get_default_provider(provider_type: str, workspace_profile: str | None = None) -> dict[str, Any]:
    normalized = normalize_workspace_profile(workspace_profile)
    db = connect()
    row = db.execute(
        """
        select * from provider_configs
        where provider_type = ?
          and is_default = 1
          and status = 'active'
          and (credential_scope = 'system' or workspace_profile = ?)
        order by
          case
            when credential_scope = 'workspace' and workspace_profile = ? then 0
            else 1
          end asc,
          updated_at desc
        limit 1
        """,
        (provider_type, normalized, normalized),
    ).fetchone()
    db.close()
    item = decode_row(row)
    if item is None:
        raise HTTPException(status_code=400, detail=f"default provider not configured: {provider_type}")
    return item


def get_provider(provider_id: str, workspace_profile: str | None = None) -> dict[str, Any]:
    db = connect()
    row = db.execute("select * from provider_configs where id = ?", (provider_id,)).fetchone()
    db.close()
    item = decode_row(row)
    if item is None:
        raise HTTPException(status_code=404, detail=f"provider not found: {provider_id}")
    if workspace_profile is not None and not provider_visible_in_workspace(item, workspace_profile):
        raise HTTPException(status_code=404, detail=f"provider not found: {provider_id}")
    return item


def get_asset(asset_id: str | None) -> dict[str, Any] | None:
    if not asset_id:
        return None
    db = connect()
    row = db.execute("select * from asset_records where id = ?", (asset_id,)).fetchone()
    db.close()
    return decode_row(row)


def _provider_root(provider: dict[str, Any]) -> Path:
    config_json = provider.get("config_json") or {}
    return Path(config_json.get("root_path") or STORAGE_DIR)


def _provider_mode(provider: dict[str, Any]) -> str:
    config_json = provider.get("config_json") or {}
    if provider.get("model") == "google-drive":
        return config_json.get("storage_mode") or "google_drive"
    if provider.get("model") == "supabase-storage":
        return config_json.get("storage_mode") or "supabase"
    return config_json.get("storage_mode") or "local"


def _google_drive_ready(provider: dict[str, Any]) -> tuple[bool, str]:
    config_json = provider.get("config_json") or {}
    if service_account is None or GoogleAuthRequest is None:
        return False, "missing google-auth dependency"
    if not config_json.get("folder_id"):
        return False, "missing folder_id"
    if not config_json.get("service_account_json"):
        return False, "missing service_account_json"
    return True, "ready"


def _supabase_ready(provider: dict[str, Any]) -> tuple[bool, str]:
    config_json = provider.get("config_json") or {}
    project_url = config_json.get("project_url") or provider.get("base_url")
    service_role_key = config_json.get("service_role_key") or provider.get("api_key")
    storage_bucket = config_json.get("storage_bucket")
    if not project_url:
        return False, "missing project_url"
    if not service_role_key:
        return False, "missing service_role_key"
    if not storage_bucket:
        return False, "missing storage_bucket"
    return True, "ready"


def storage_provider_is_ready(provider: dict[str, Any]) -> tuple[bool, str]:
    if provider.get("provider_type") != "storage":
        return False, "not storage provider"
    if provider.get("model") == "google-drive":
        return _google_drive_ready(provider)
    if provider.get("model") == "supabase-storage":
        return _supabase_ready(provider)
    if provider.get("model") == "local-storage-v1":
        root = _provider_root(provider)
        return root.exists(), str(root)
    return False, "unsupported storage provider"


def _load_google_service_account(provider: dict[str, Any]) -> dict[str, Any]:
    config_json = provider.get("config_json") or {}
    raw = config_json.get("service_account_json")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        return json.loads(raw)
    raise HTTPException(status_code=400, detail="invalid google drive service account json")


def _google_drive_access_token(provider: dict[str, Any]) -> str:
    ready, reason = _google_drive_ready(provider)
    if not ready:
        raise HTTPException(status_code=400, detail=f"google drive provider not ready: {reason}")
    credentials = service_account.Credentials.from_service_account_info(
        _load_google_service_account(provider),
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    credentials.refresh(GoogleAuthRequest())
    if not credentials.token:
        raise HTTPException(status_code=400, detail="failed to obtain google drive access token")
    return credentials.token


def _google_drive_project_folder(provider: dict[str, Any], project_id: str) -> str:
    token = _google_drive_access_token(provider)
    config_json = provider.get("config_json") or {}
    root_folder_id = config_json["folder_id"]
    query = f"name = '{project_id}' and mimeType = 'application/vnd.google-apps.folder' and '{root_folder_id}' in parents and trashed = false"
    response = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        headers={"Authorization": f"Bearer {token}"},
        params={"q": query, "fields": "files(id,name)", "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"},
        timeout=60,
    )
    response.raise_for_status()
    files = response.json().get("files", [])
    if files:
        return files[0]["id"]

    create_response = requests.post(
        "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "name": project_id,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [root_folder_id],
        },
        timeout=60,
    )
    create_response.raise_for_status()
    return create_response.json()["id"]


def _upload_to_google_drive(provider: dict[str, Any], project_id: str, relative_path: str, local_path: Path) -> dict[str, Any]:
    token = _google_drive_access_token(provider)
    folder_id = _google_drive_project_folder(provider, project_id)
    mime_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    metadata = {
        "name": relative_path.replace("/", "__"),
        "parents": [folder_id],
    }
    files = {
        "metadata": ("metadata", json.dumps(metadata), "application/json; charset=UTF-8"),
        "file": (local_path.name, local_path.read_bytes(), mime_type),
    }
    response = requests.post(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        timeout=120,
    )
    response.raise_for_status()
    return response.json()


def _supabase_config(provider: dict[str, Any]) -> dict[str, Any]:
    config_json = provider.get("config_json") or {}
    return {
        "project_url": (config_json.get("project_url") or provider.get("base_url") or "").rstrip("/"),
        "service_role_key": config_json.get("service_role_key") or provider.get("api_key") or "",
        "storage_bucket": config_json.get("storage_bucket") or "",
        "metadata_table": config_json.get("metadata_table") or "",
    }


def _upload_to_supabase_storage(provider: dict[str, Any], project_id: str, relative_path: str, local_path: Path) -> dict[str, Any]:
    config = _supabase_config(provider)
    headers = {
        "Authorization": f"Bearer {config['service_role_key']}",
        "apikey": config["service_role_key"],
        "x-upsert": "true",
        "Content-Type": mimetypes.guess_type(local_path.name)[0] or "application/octet-stream",
    }
    object_path = f"{project_id}/{relative_path}"
    response = requests.post(
        f"{config['project_url']}/storage/v1/object/{config['storage_bucket']}/{object_path}",
        headers=headers,
        data=local_path.read_bytes(),
        timeout=120,
    )
    response.raise_for_status()
    return response.json() if response.content else {"object_path": object_path}


def _upsert_supabase_metadata(provider: dict[str, Any], project_id: str, relative_path: str, local_path: Path) -> dict[str, Any] | None:
    config = _supabase_config(provider)
    if not config["metadata_table"]:
        return None
    headers = {
        "Authorization": f"Bearer {config['service_role_key']}",
        "apikey": config["service_role_key"],
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    payload = {
        "project_id": project_id,
        "relative_path": relative_path,
        "size": local_path.stat().st_size,
        "mime_type": mimetypes.guess_type(local_path.name)[0] or "application/octet-stream",
        "updated_at": now(),
    }
    response = requests.post(
        f"{config['project_url']}/rest/v1/{config['metadata_table']}",
        headers=headers,
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    return response.json() if response.content else {"upserted": True}


def _request_json(url: str, method: str, payload: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> dict[str, Any]:
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers=headers or {"Content-Type": "application/json"},
        method=method,
    )
    with request.urlopen(req, timeout=60) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body else {}


def maybe_call_openai(provider: dict[str, Any], model: str, prompt: str) -> dict[str, Any] | None:
    api_key = provider.get("api_key") or ""
    base_url = provider.get("base_url") or ""
    if not api_key or not base_url:
        return None

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant that returns concise training summaries."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
    }
    try:
        return _request_json(
            base_url,
            "POST",
            payload,
            {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        )
    except (error.URLError, error.HTTPError, TimeoutError, ValueError):
        return None


def build_provider_url(base_url: str, path: str) -> str:
    if not path:
        return base_url
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def call_generic_video_provider(provider: dict[str, Any], render_request: dict[str, Any], scene: dict[str, Any]) -> dict[str, Any]:
    provider = apply_video_vendor_defaults(provider)
    vendor_def = resolve_video_vendor(provider)
    create_request = build_video_create_request(provider, render_request, scene)

    if create_request["url"]:
        try:
            created = _request_json(
                create_request["url"],
                create_request["method"],
                create_request.get("payload"),
                create_request["headers"],
            )
            job_id = extract_job_id(created, vendor_def["job_id_paths"]) or str(uuid.uuid4())
            poll_snapshot: dict[str, Any] | None = None
            poll_request = build_video_poll_request(provider, job_id)
            if poll_request:
                try:
                    poll_snapshot = _request_json(
                        poll_request["url"],
                        poll_request["method"],
                        poll_request.get("payload"),
                        poll_request["headers"],
                    )
                except (error.URLError, error.HTTPError, TimeoutError, ValueError):
                    poll_snapshot = None
            normalized = normalize_video_job(provider, job_id, created, poll_snapshot)
            return {
                "mode": vendor_def["vendor"],
                "job_id": job_id,
                "status": normalized["status"],
                "request_payload": create_request.get("payload") or {},
                "response_payload": {
                    "create": created,
                    "poll": poll_snapshot,
                    "normalized": normalized,
                },
            }
        except (error.URLError, error.HTTPError, TimeoutError, ValueError) as exc:
            return {
                "mode": "fallback_mock",
                "job_id": str(uuid.uuid4()),
                "status": "completed",
                "request_payload": create_request.get("payload") or {},
                "response_payload": {"error": str(exc), "fallback": "mock"},
            }

    return {
        "mode": "mock",
        "job_id": str(uuid.uuid4()),
        "status": "completed",
        "request_payload": create_request.get("payload") or {},
        "response_payload": {"message": "mock provider used"},
    }


def check_provider_health(provider: dict[str, Any]) -> dict[str, Any]:
    provider_type = provider.get("provider_type")
    model = provider.get("model") or ""

    if provider_type == "storage":
        ok, detail = storage_provider_is_ready(provider)
        return {"ok": ok, "mode": _provider_mode(provider), "detail": detail}

    if provider_type == "text_llm":
        return {
            "ok": bool(provider.get("base_url") and provider.get("api_key")),
            "mode": "live" if provider.get("base_url") and provider.get("api_key") else "mock",
            "detail": model,
        }

    if provider_type == "video_llm":
        resolved = apply_video_vendor_defaults(provider)
        vendor_def = resolve_video_vendor(resolved)
        return {
            "ok": bool(resolved.get("base_url") and resolved.get("create_job_path")),
            "mode": vendor_def["vendor"],
            "detail": resolved.get("model") or model,
        }

    return {"ok": False, "mode": "unknown", "detail": "unsupported provider type"}


def _request_connection(method: str, url: str, **kwargs: Any) -> tuple[requests.Response, int]:
    started = time.perf_counter()
    response = requests.request(method, url, **kwargs)
    latency_ms = int((time.perf_counter() - started) * 1000)
    return response, latency_ms


def _response_detail(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        text = (response.text or "").strip()
        return text[:240] if text else f"HTTP {response.status_code}"

    if isinstance(payload, dict):
        for key in ("message", "detail", "error_description"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        error_value = payload.get("error")
        if isinstance(error_value, str) and error_value.strip():
            return error_value.strip()
        if isinstance(error_value, dict):
            for key in ("message", "detail", "code", "type"):
                value = error_value.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

    return f"HTTP {response.status_code}"


def _connection_result(
    provider: dict[str, Any],
    *,
    ok: bool,
    mode: str,
    detail: str,
    endpoint: str = "",
    status_code: int | None = None,
    latency_ms: int | None = None,
) -> dict[str, Any]:
    return {
        "ok": ok,
        "provider_type": provider.get("provider_type"),
        "provider_name": provider.get("name") or "",
        "mode": mode,
        "detail": detail,
        "endpoint": endpoint,
        "status_code": status_code,
        "latency_ms": latency_ms,
    }


def _test_text_provider_connection(provider: dict[str, Any]) -> dict[str, Any]:
    base_url = (provider.get("base_url") or "").strip()
    api_key = (provider.get("api_key") or "").strip()
    model = (provider.get("model") or "").strip()
    if not base_url:
        return _connection_result(provider, ok=False, mode="text_llm", detail="缺少基礎網址。")
    if not api_key:
        return _connection_result(provider, ok=False, mode="text_llm", detail="缺少 API 金鑰。")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    normalized_base_url = base_url.rstrip("/")
    try:
        if normalized_base_url.endswith("/chat/completions"):
            response, latency_ms = _request_connection(
                "POST",
                base_url,
                headers=headers,
                json={
                    "model": model or "gpt-4.1-mini",
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                },
                timeout=20,
            )
            if response.ok:
                return _connection_result(
                    provider,
                    ok=True,
                    mode="chat_completions",
                    detail=f"已成功呼叫文字模型端點，模型：{model or '未指定'}。",
                    endpoint=base_url,
                    status_code=response.status_code,
                    latency_ms=latency_ms,
                )
            return _connection_result(
                provider,
                ok=False,
                mode="chat_completions",
                detail=_response_detail(response),
                endpoint=base_url,
                status_code=response.status_code,
                latency_ms=latency_ms,
            )

        if normalized_base_url.endswith("/responses"):
            response, latency_ms = _request_connection(
                "POST",
                base_url,
                headers=headers,
                json={
                    "model": model or "gpt-4.1-mini",
                    "input": "ping",
                    "max_output_tokens": 1,
                },
                timeout=20,
            )
            if response.ok:
                return _connection_result(
                    provider,
                    ok=True,
                    mode="responses",
                    detail=f"已成功呼叫 Responses 端點，模型：{model or '未指定'}。",
                    endpoint=base_url,
                    status_code=response.status_code,
                    latency_ms=latency_ms,
                )
            return _connection_result(
                provider,
                ok=False,
                mode="responses",
                detail=_response_detail(response),
                endpoint=base_url,
                status_code=response.status_code,
                latency_ms=latency_ms,
            )

        candidates: list[str] = []
        if model:
            candidates.append(build_provider_url(base_url, f"models/{parse.quote(model, safe='')}"))
        candidates.append(build_provider_url(base_url, "models"))

        for index, endpoint in enumerate(candidates):
            response, latency_ms = _request_connection("GET", endpoint, headers=headers, timeout=20)
            if response.ok:
                detail = f"已確認文字模型連線，模型：{model or '未指定'}。"
                if index == len(candidates) - 1 and not model:
                    detail = "已成功讀取模型清單。"
                return _connection_result(
                    provider,
                    ok=True,
                    mode="models",
                    detail=detail,
                    endpoint=endpoint,
                    status_code=response.status_code,
                    latency_ms=latency_ms,
                )
            if response.status_code == 404 and index == 0 and len(candidates) > 1:
                continue
            return _connection_result(
                provider,
                ok=False,
                mode="models",
                detail=_response_detail(response),
                endpoint=endpoint,
                status_code=response.status_code,
                latency_ms=latency_ms,
            )
    except requests.RequestException as exc:
        return _connection_result(provider, ok=False, mode="text_llm", detail=f"連線失敗：{exc}", endpoint=base_url)

    return _connection_result(provider, ok=False, mode="text_llm", detail="無法判斷文字模型連線狀態。", endpoint=base_url)


def _test_video_provider_connection(provider: dict[str, Any]) -> dict[str, Any]:
    base_url = (provider.get("base_url") or "").strip()
    create_job_path = (provider.get("create_job_path") or "").strip()
    if not base_url:
        return _connection_result(provider, ok=False, mode="video_llm", detail="缺少基礎網址。")
    if not create_job_path:
        return _connection_result(provider, ok=False, mode="video_llm", detail="缺少建立任務路徑。")

    endpoint = build_provider_url(base_url, create_job_path)
    headers = {"Accept": "application/json"}
    api_key = (provider.get("api_key") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response, latency_ms = _request_connection("GET", endpoint, headers=headers, timeout=20)
    except requests.RequestException as exc:
        return _connection_result(provider, ok=False, mode="video_llm", detail=f"連線失敗：{exc}", endpoint=endpoint)

    if response.status_code in {200, 204}:
        return _connection_result(
            provider,
            ok=True,
            mode="video_endpoint",
            detail="已成功連到影片任務端點。",
            endpoint=endpoint,
            status_code=response.status_code,
            latency_ms=latency_ms,
        )
    if response.status_code == 405:
        return _connection_result(
            provider,
            ok=True,
            mode="video_endpoint",
            detail="端點可達，伺服器要求以 POST 建立影片任務。",
            endpoint=endpoint,
            status_code=response.status_code,
            latency_ms=latency_ms,
        )
    return _connection_result(
        provider,
        ok=False,
        mode="video_endpoint",
        detail=_response_detail(response),
        endpoint=endpoint,
        status_code=response.status_code,
        latency_ms=latency_ms,
    )


def _test_storage_provider_connection(provider: dict[str, Any]) -> dict[str, Any]:
    model = provider.get("model") or ""
    if model == "local-storage-v1":
        root = _provider_root(provider)
        if root.exists():
            return _connection_result(provider, ok=True, mode="local_storage", detail=f"本機儲存目錄存在：{root}", endpoint=str(root))
        return _connection_result(provider, ok=False, mode="local_storage", detail=f"找不到本機儲存目錄：{root}", endpoint=str(root))

    if model == "google-drive":
        ready, reason = _google_drive_ready(provider)
        if not ready:
            return _connection_result(provider, ok=False, mode="google_drive", detail=f"Google Drive 設定不完整：{reason}")
        config_json = provider.get("config_json") or {}
        folder_id = str(config_json.get("folder_id") or "").strip()
        try:
            token = _google_drive_access_token(provider)
            response, latency_ms = _request_connection(
                "GET",
                f"https://www.googleapis.com/drive/v3/files/{folder_id}",
                headers={"Authorization": f"Bearer {token}"},
                params={"fields": "id,name", "supportsAllDrives": "true"},
                timeout=20,
            )
        except Exception as exc:  # pragma: no cover - depends on optional google auth stack
            return _connection_result(provider, ok=False, mode="google_drive", detail=f"Google Drive 驗證失敗：{exc}", endpoint=folder_id)

        if response.ok:
            return _connection_result(
                provider,
                ok=True,
                mode="google_drive",
                detail="已確認 Google Drive 資料夾權限。",
                endpoint=folder_id,
                status_code=response.status_code,
                latency_ms=latency_ms,
            )
        return _connection_result(
            provider,
            ok=False,
            mode="google_drive",
            detail=_response_detail(response),
            endpoint=folder_id,
            status_code=response.status_code,
            latency_ms=latency_ms,
        )

    if model == "supabase-storage":
        ready, reason = _supabase_ready(provider)
        if not ready:
            return _connection_result(provider, ok=False, mode="supabase_storage", detail=f"Supabase 設定不完整：{reason}")
        config = _supabase_config(provider)
        endpoint = f"{config['project_url']}/storage/v1/bucket/{config['storage_bucket']}"
        try:
            response, latency_ms = _request_connection(
                "GET",
                endpoint,
                headers={
                    "Authorization": f"Bearer {config['service_role_key']}",
                    "apikey": config["service_role_key"],
                },
                timeout=20,
            )
        except requests.RequestException as exc:
            return _connection_result(provider, ok=False, mode="supabase_storage", detail=f"連線失敗：{exc}", endpoint=endpoint)

        if response.ok:
            return _connection_result(
                provider,
                ok=True,
                mode="supabase_storage",
                detail="已確認 Supabase Storage bucket 可存取。",
                endpoint=endpoint,
                status_code=response.status_code,
                latency_ms=latency_ms,
            )
        return _connection_result(
            provider,
            ok=False,
            mode="supabase_storage",
            detail=_response_detail(response),
            endpoint=endpoint,
            status_code=response.status_code,
            latency_ms=latency_ms,
        )

    ready, reason = storage_provider_is_ready(provider)
    return _connection_result(provider, ok=ready, mode=_provider_mode(provider), detail=reason)


def _test_video_provider_connection(provider: dict[str, Any]) -> dict[str, Any]:
    resolved = apply_video_vendor_defaults(provider)
    base_url = (resolved.get("base_url") or "").strip()
    create_job_path = (resolved.get("create_job_path") or "").strip()
    vendor_def = resolve_video_vendor(resolved)
    vendor = vendor_def["vendor"]
    if not base_url:
        return _connection_result(provider, ok=False, mode=vendor, detail="缺少基礎網址")
    if not create_job_path:
        return _connection_result(provider, ok=False, mode=vendor, detail="缺少建立任務路徑")

    probe = build_video_connection_probe(resolved)
    endpoint = probe["url"]
    success_statuses = set(probe.get("success_statuses") or {200})
    auth_failure_statuses = set(probe.get("auth_failure_statuses") or set())

    try:
        response, latency_ms = _request_connection(
            probe["method"],
            endpoint,
            headers=probe["headers"],
            json=probe.get("payload"),
            timeout=20,
        )
    except requests.RequestException as exc:
        return _connection_result(provider, ok=False, mode=vendor, detail=f"連線失敗：{exc}", endpoint=endpoint)

    if response.status_code in auth_failure_statuses:
        return _connection_result(
            provider,
            ok=False,
            mode=vendor,
            detail="認證失敗，請檢查 API key 或權限。",
            endpoint=endpoint,
            status_code=response.status_code,
            latency_ms=latency_ms,
        )
    if response.status_code in success_statuses:
        return _connection_result(
            provider,
            ok=True,
            mode=vendor,
            detail=f"{vendor_def['label']} 連線測試成功。",
            endpoint=endpoint,
            status_code=response.status_code,
            latency_ms=latency_ms,
        )
    return _connection_result(
        provider,
        ok=False,
        mode=vendor,
        detail=_response_detail(response),
        endpoint=endpoint,
        status_code=response.status_code,
        latency_ms=latency_ms,
    )


def test_provider_connection(provider: dict[str, Any]) -> dict[str, Any]:
    provider_type = provider.get("provider_type")
    if provider_type == "text_llm":
        return _test_text_provider_connection(provider)
    if provider_type == "video_llm":
        return _test_video_provider_connection(provider)
    if provider_type == "storage":
        return _test_storage_provider_connection(provider)
    return _connection_result(provider, ok=False, mode="unknown", detail="不支援的供應商類型。")


def log_provider_call(
    db,
    provider_id: str,
    provider_type: str,
    project_id: str,
    action: str,
    request_payload: dict[str, Any],
    response_payload: dict[str, Any] | None,
    status: str,
    error_message: str = "",
) -> None:
    db.execute(
        """
        insert into provider_call_logs
        (id, provider_id, provider_type, project_id, action, request_json, response_json, status, error_message, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            provider_id,
            provider_type,
            project_id,
            action,
            json.dumps(request_payload, ensure_ascii=False),
            json.dumps(response_payload or {}, ensure_ascii=False),
            status,
            error_message,
            now(),
        ),
    )
