from __future__ import annotations

from copy import deepcopy
from typing import Any
from urllib import parse


VIDEO_VENDOR_CATALOG: dict[str, dict[str, Any]] = {
    "generic_rest": {
        "vendor": "generic_rest",
        "label": "Generic REST Video",
        "auth_mode": "bearer",
        "default_model": "generic-video-v1",
        "default_base_url": "",
        "default_create_job_path": "",
        "default_get_job_path": "/jobs/{job_id}",
        "job_id_paths": ["job_id", "id", "data.job_id"],
        "notes": "適合具備 create job / poll job 形式的一般非同步影片 API。",
    },
    "openai_sora": {
        "vendor": "openai_sora",
        "label": "OpenAI Sora",
        "auth_mode": "bearer",
        "default_model": "sora-2",
        "default_base_url": "https://api.openai.com/v1",
        "default_create_job_path": "/videos",
        "default_get_job_path": "/videos/{job_id}",
        "job_id_paths": ["id", "job_id", "data.id"],
        "notes": "使用 OpenAI Bearer API key，建立影片後再輪詢影片狀態。",
    },
    "google_veo": {
        "vendor": "google_veo",
        "label": "Google Veo",
        "auth_mode": "x_goog_api_key",
        "default_model": "veo-3.1-generate-preview",
        "default_base_url": "https://generativelanguage.googleapis.com/v1beta",
        "default_create_job_path": "/models/veo-3.1-generate-preview:predictLongRunning",
        "default_get_job_path": "/{job_id}",
        "job_id_paths": ["name", "job_id", "id"],
        "notes": "Gemini API / Veo 以長任務 operation 回傳結果，需再查詢 operation 狀態。",
    },
    "seedance": {
        "vendor": "seedance",
        "label": "SeedDance",
        "auth_mode": "bearer",
        "default_model": "doubao-seedance-1-5-pro-251215",
        "default_base_url": "https://operator.las.cn-beijing.volces.com",
        "default_create_job_path": "/api/v1/contents/generations/tasks",
        "default_get_job_path": "/api/v1/contents/generations/tasks/{job_id}",
        "job_id_paths": ["data.task_id", "data.id", "task_id", "id"],
        "notes": "使用任務建立與任務查詢兩段式流程，適合納入統一 job adapter。",
    },
    "runway": {
        "vendor": "runway",
        "label": "Runway",
        "auth_mode": "bearer",
        "default_model": "gen4_turbo",
        "default_base_url": "https://api.dev.runwayml.com/v1",
        "default_create_job_path": "/image_to_video",
        "default_get_job_path": "/tasks/{job_id}",
        "job_id_paths": ["id", "task_id", "data.id"],
        "notes": "需以 Runway 版本標頭呼叫建立任務與查詢任務 API。",
    },
}


def list_video_vendor_catalog() -> list[dict[str, Any]]:
    return [deepcopy(item) for item in VIDEO_VENDOR_CATALOG.values()]


def get_video_vendor_definition(vendor: str | None) -> dict[str, Any]:
    key = (vendor or "generic_rest").strip().lower()
    return deepcopy(VIDEO_VENDOR_CATALOG.get(key) or VIDEO_VENDOR_CATALOG["generic_rest"])


def resolve_video_vendor(provider: dict[str, Any]) -> dict[str, Any]:
    config_json = provider.get("config_json") or {}
    vendor = str(config_json.get("video_vendor") or config_json.get("vendor") or "").strip().lower()
    if vendor:
        return get_video_vendor_definition(vendor)

    model = str(provider.get("model") or "").strip().lower()
    base_url = str(provider.get("base_url") or "").strip().lower()
    name = str(provider.get("name") or "").strip().lower()
    joined = " ".join([model, base_url, name])

    if "sora" in joined or "openai" in joined:
        return get_video_vendor_definition("openai_sora")
    if "veo" in joined or "generativelanguage.googleapis.com" in joined or "gemini" in joined:
        return get_video_vendor_definition("google_veo")
    if "seedance" in joined or "volcengine" in joined or "las.cn-beijing" in joined:
        return get_video_vendor_definition("seedance")
    if "runway" in joined:
        return get_video_vendor_definition("runway")
    return get_video_vendor_definition("generic_rest")


def apply_video_vendor_defaults(provider: dict[str, Any]) -> dict[str, Any]:
    resolved = deepcopy(provider)
    config_json = deepcopy(resolved.get("config_json") or {})
    vendor_def = resolve_video_vendor(resolved)

    config_json.setdefault("video_vendor", vendor_def["vendor"])
    config_json.setdefault("auth_mode", vendor_def["auth_mode"])
    resolved["config_json"] = config_json
    resolved["base_url"] = resolved.get("base_url") or vendor_def["default_base_url"]
    resolved["model"] = resolved.get("model") or vendor_def["default_model"]
    resolved["create_job_path"] = resolved.get("create_job_path") or vendor_def["default_create_job_path"]
    resolved["get_job_path"] = resolved.get("get_job_path") or vendor_def["default_get_job_path"]
    return resolved


def build_video_auth_headers(provider: dict[str, Any], *, content_type: str = "application/json") -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": content_type}
    api_key = str(provider.get("api_key") or "").strip()
    auth_mode = str((provider.get("config_json") or {}).get("auth_mode") or "bearer").strip().lower()
    if not api_key:
        return headers
    if auth_mode == "bearer":
        headers["Authorization"] = f"Bearer {api_key}"
    elif auth_mode == "x_api_key":
        headers["x-api-key"] = api_key
    elif auth_mode == "x_goog_api_key":
        headers["x-goog-api-key"] = api_key
    return headers


def build_video_provider_url(provider: dict[str, Any], path: str) -> str:
    base_url = str(provider.get("base_url") or "")
    auth_mode = str((provider.get("config_json") or {}).get("auth_mode") or "bearer").strip().lower()
    api_key = str(provider.get("api_key") or "").strip()
    url = base_url
    if path:
        if path.startswith("http://") or path.startswith("https://"):
            url = path
        else:
            url = parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    if auth_mode == "api_key_query" and api_key:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}key={parse.quote(api_key)}"
    return url


def extract_job_id(payload: dict[str, Any] | None, job_id_paths: list[str]) -> str | None:
    if not isinstance(payload, dict):
        return None
    for path in job_id_paths:
        current: Any = payload
        for part in path.split("."):
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(part)
        if isinstance(current, str) and current.strip():
            return current.strip()
    return None
