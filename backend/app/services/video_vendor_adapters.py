from __future__ import annotations

from typing import Any
from urllib import parse

from .video_vendor_registry import (
    apply_video_vendor_defaults,
    build_video_auth_headers,
    build_video_provider_url,
    resolve_video_vendor,
)


RUNWAY_API_VERSION = "2024-11-06"


def _pick_prompt(scene: dict[str, Any]) -> str:
    return (
        str(scene.get("prompt") or "")
        or str(scene.get("visual_prompt") or "")
        or str(scene.get("narration") or "")
        or str(scene.get("scene_title") or "")
        or "Generate a short training video scene."
    )


def _pick_seconds(scene: dict[str, Any], render_request: dict[str, Any]) -> int:
    value = scene.get("duration") or scene.get("duration_seconds") or render_request.get("duration") or 8
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 8


def _pick_resolution(render_request: dict[str, Any]) -> str:
    value = str(render_request.get("resolution") or "1280x720").strip()
    return value or "1280x720"


def _pick_aspect_ratio(render_request: dict[str, Any]) -> str:
    value = str((render_request.get("video_profile") or {}).get("aspect_ratio") or render_request.get("aspect_ratio") or "").strip()
    if value:
        return value
    resolution = _pick_resolution(render_request)
    if "x" in resolution:
        width, height = resolution.lower().split("x", 1)
        return f"{width}:{height}"
    return "16:9"


def _pick_audio_enabled(render_request: dict[str, Any]) -> bool:
    video_profile = render_request.get("video_profile") or {}
    if "audio_enabled" in video_profile:
        return bool(video_profile.get("audio_enabled"))
    audio = render_request.get("audio")
    if isinstance(audio, dict) and "enable" in audio:
        return bool(audio.get("enable"))
    return True


def _seedance_resolution(render_request: dict[str, Any]) -> str:
    resolution = _pick_resolution(render_request)
    if resolution.startswith("1920x") or resolution.startswith("1080x"):
        return "1080p"
    if resolution.startswith("854x") or resolution.startswith("640x") or resolution.startswith("480x"):
        return "480p"
    return "720p"


def _runway_ratio(render_request: dict[str, Any]) -> str:
    aspect = _pick_aspect_ratio(render_request)
    if aspect in {"16:9", "9:16"}:
        # Runway expects explicit pixel ratio strings.
        return "1280:720" if aspect == "16:9" else "720:1280"
    resolution = _pick_resolution(render_request)
    return resolution.replace("x", ":")


def _get_nested(payload: dict[str, Any] | None, *paths: str) -> Any:
    if not isinstance(payload, dict):
        return None
    for path in paths:
        current: Any = payload
        for part in path.split("."):
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(part)
        if current is not None:
            return current
    return None


def _normalize_status(vendor: str, payload: dict[str, Any] | None) -> str:
    if vendor == "openai_sora":
        return str(_get_nested(payload, "status") or "submitted").lower()
    if vendor == "google_veo":
        if not isinstance(payload, dict):
            return "submitted"
        if not payload.get("done"):
            return "running"
        if payload.get("error"):
            return "failed"
        return "completed"
    if vendor == "seedance":
        return str(_get_nested(payload, "status") or "submitted").lower()
    if vendor == "runway":
        value = str(_get_nested(payload, "status") or "submitted").upper()
        mapping = {
            "PENDING": "queued",
            "RUNNING": "running",
            "THROTTLED": "queued",
            "SUCCEEDED": "completed",
            "FAILED": "failed",
            "CANCELLED": "cancelled",
        }
        return mapping.get(value, value.lower())
    return str(_get_nested(payload, "status") or "submitted").lower()


def _extract_result_url(vendor: str, payload: dict[str, Any] | None, provider: dict[str, Any], job_id: str) -> str | None:
    if vendor == "openai_sora" and _normalize_status(vendor, payload) == "completed":
        return build_video_provider_url(provider, f"/videos/{job_id}/content")
    if vendor == "google_veo":
        return _get_nested(
            payload,
            "response.generateVideoResponse.generatedSamples.0.video.uri",
            "response.generated_videos.0.video.uri",
        )
    if vendor == "seedance":
        return _get_nested(payload, "content.video_url")
    if vendor == "runway":
        output = _get_nested(payload, "output")
        if isinstance(output, list) and output:
            return str(output[0])
        return _get_nested(payload, "output.video")
    return None


def build_video_create_request(provider: dict[str, Any], render_request: dict[str, Any], scene: dict[str, Any]) -> dict[str, Any]:
    resolved = apply_video_vendor_defaults(provider)
    vendor = resolve_video_vendor(resolved)["vendor"]
    prompt = _pick_prompt(scene)
    duration_seconds = _pick_seconds(scene, render_request)
    resolution = _pick_resolution(render_request)
    aspect_ratio = _pick_aspect_ratio(render_request)
    headers = build_video_auth_headers(resolved)
    url = build_video_provider_url(resolved, resolved.get("create_job_path") or "")
    model = str(resolved.get("model") or "")

    if vendor == "openai_sora":
        return {
            "vendor": vendor,
            "method": "POST",
            "url": url,
            "headers": headers,
            "payload": {
                "model": model or "sora-2",
                "prompt": prompt,
                "seconds": duration_seconds,
                "size": resolution,
            },
        }

    if vendor == "google_veo":
        return {
            "vendor": vendor,
            "method": "POST",
            "url": url,
            "headers": headers,
            "payload": {
                "instances": [{"prompt": prompt}],
                "parameters": {
                    "aspectRatio": aspect_ratio,
                    "durationSeconds": duration_seconds,
                    "resolution": "1080p" if resolution.startswith("1920x") else "720p",
                },
            },
        }

    if vendor == "seedance":
        return {
            "vendor": vendor,
            "method": "POST",
            "url": url,
            "headers": headers,
            "payload": {
                "model": model or "doubao-seedance-1-5-pro-251215",
                "content": [{"type": "text", "text": prompt}],
                "ratio": aspect_ratio,
                "duration": duration_seconds,
                "resolution": _seedance_resolution(render_request),
                "watermark": False,
                "generate_audio": _pick_audio_enabled(render_request),
            },
        }

    if vendor == "runway":
        vendor_headers = {
            **headers,
            "X-Runway-Version": str((resolved.get("config_json") or {}).get("runway_version") or RUNWAY_API_VERSION),
        }
        return {
            "vendor": vendor,
            "method": "POST",
            "url": url,
            "headers": vendor_headers,
            "payload": {
                "model": model or "gen4.5",
                "promptText": prompt,
                "ratio": _runway_ratio(render_request),
                "duration": duration_seconds,
                "audio": _pick_audio_enabled(render_request),
            },
        }

    return {
        "vendor": vendor,
        "method": "POST",
        "url": url,
        "headers": headers,
        "payload": {
            "vendor": vendor,
            "model": model or "generic-video-v1",
            "video_profile": render_request.get("video_profile") or {},
            "vendor_targets": render_request.get("vendor_targets") or {},
            "scene": scene,
            "render_request": render_request,
            "region": resolved.get("region") or "global",
        },
    }


def build_video_poll_request(provider: dict[str, Any], job_id: str) -> dict[str, Any] | None:
    resolved = apply_video_vendor_defaults(provider)
    vendor = resolve_video_vendor(resolved)["vendor"]
    get_job_path = str(resolved.get("get_job_path") or "").strip()
    if not get_job_path:
        return None

    headers = build_video_auth_headers(resolved)
    url = build_video_provider_url(resolved, get_job_path.format(job_id=parse.quote(job_id, safe=":/{}")))

    if vendor == "runway":
        headers = {
            **headers,
            "X-Runway-Version": str((resolved.get("config_json") or {}).get("runway_version") or RUNWAY_API_VERSION),
        }

    return {
        "vendor": vendor,
        "method": "GET",
        "url": url,
        "headers": headers,
    }


def normalize_video_job(provider: dict[str, Any], job_id: str, created: dict[str, Any] | None, polled: dict[str, Any] | None) -> dict[str, Any]:
    resolved = apply_video_vendor_defaults(provider)
    vendor = resolve_video_vendor(resolved)["vendor"]
    snapshot = polled or created or {}
    return {
        "vendor": vendor,
        "status": _normalize_status(vendor, snapshot),
        "progress": _get_nested(snapshot, "progress") or _get_nested(snapshot, "metadata.progressPercent"),
        "result_url": _extract_result_url(vendor, snapshot, resolved, job_id),
        "error": _get_nested(snapshot, "error.message", "error.detail", "error", "failure", "taskDetails.message"),
    }


def build_video_connection_probe(provider: dict[str, Any]) -> dict[str, Any]:
    resolved = apply_video_vendor_defaults(provider)
    vendor = resolve_video_vendor(resolved)["vendor"]
    headers = build_video_auth_headers(resolved)
    model = str(resolved.get("model") or "").strip()

    if vendor == "openai_sora":
        return {
            "vendor": vendor,
            "method": "GET",
            "url": build_video_provider_url(resolved, f"/models/{parse.quote(model or 'sora-2', safe='')}"),
            "headers": headers,
            "success_statuses": {200},
        }

    if vendor == "google_veo":
        return {
            "vendor": vendor,
            "method": "GET",
            "url": build_video_provider_url(resolved, f"/models/{parse.quote(model or 'veo-3.1-generate-preview', safe='')}"),
            "headers": headers,
            "success_statuses": {200},
        }

    if vendor == "runway":
        return {
            "vendor": vendor,
            "method": "GET",
            "url": build_video_provider_url(resolved, "/organization"),
            "headers": {
                **headers,
                "X-Runway-Version": str((resolved.get("config_json") or {}).get("runway_version") or RUNWAY_API_VERSION),
            },
            "success_statuses": {200},
        }

    if vendor == "seedance":
        return {
            "vendor": vendor,
            "method": "POST",
            "url": build_video_provider_url(resolved, resolved.get("create_job_path") or "/contents/generations/tasks"),
            "headers": headers,
            "payload": {},
            "success_statuses": {400, 401, 403, 422},
            "auth_failure_statuses": {401, 403},
        }

    return {
        "vendor": vendor,
        "method": "GET",
        "url": build_video_provider_url(resolved, resolved.get("create_job_path") or ""),
        "headers": headers,
        "success_statuses": {200, 204, 405},
    }
