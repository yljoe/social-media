from __future__ import annotations

import json
import uuid
from typing import Any

from ..db import now


def parse_storyboard_payload(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
        scenes = data.get("scenes") if isinstance(data, dict) else data
        if not isinstance(scenes, list):
            raise ValueError("invalid storyboard payload")
        return {
            "video_profile": data.get("video_profile", {}) if isinstance(data, dict) else {},
            "vendor_targets": data.get("vendor_targets", {}) if isinstance(data, dict) else {},
            "scenes": [
                {
                    "scene_key": item.get("scene_key") or item.get("scene_id") or f"scene_{index:03d}",
                    "scene_title": item.get("scene_title") or item.get("goal") or f"場景 {index}",
                    "prompt": item.get("prompt") or item.get("visual_prompt", ""),
                    "narration": item.get("narration", ""),
                    "subtitle": item.get("subtitle") or item.get("narration", ""),
                    "duration": int(item.get("duration") or item.get("duration_seconds", 8)),
                    "vendor_overrides": item.get("vendor_overrides") or {},
                }
                for index, item in enumerate(scenes, start=1)
            ],
        }
    except (json.JSONDecodeError, ValueError, TypeError, AttributeError):
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return {
            "video_profile": {},
            "vendor_targets": {},
            "scenes": [
                {
                    "scene_key": f"scene_{index:03d}",
                    "scene_title": f"場景 {index}",
                    "prompt": line,
                    "narration": line,
                    "subtitle": line,
                    "duration": 8,
                    "vendor_overrides": {},
                }
                for index, line in enumerate(lines, start=1)
            ],
        }


def parse_storyboard_text(text: str) -> list[dict[str, Any]]:
    return parse_storyboard_payload(text)["scenes"]


def _normalize_custom_fields(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {str(key): item for key, item in value.items()}
    return {}


def default_video_composition(
    project_id: str,
    workspace_profile: str,
    global_settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    settings = global_settings or {}
    return {
        "project_id": project_id,
        "workspace_profile": workspace_profile,
        "composition_version": "v2",
        "global_settings": {
            "duration_seconds": int(settings.get("duration_seconds") or settings.get("default_total_duration_seconds") or 24),
            "scene_duration_seconds": int(settings.get("scene_duration_seconds") or settings.get("default_scene_duration_seconds") or 8),
            "resolution": str(settings.get("resolution") or settings.get("default_resolution") or "1280x720"),
            "aspect_ratio": str(settings.get("aspect_ratio") or settings.get("default_aspect_ratio") or "16:9"),
            "subtitle_enabled": bool(settings.get("subtitle_enabled", settings.get("default_subtitle_enabled", True))),
            "subtitle_language": str(settings.get("subtitle_language") or settings.get("default_subtitle_language") or "繁體中文"),
            "font_family": str(settings.get("font_family") or settings.get("default_font_family") or "Noto Sans TC"),
            "preferred_video_provider_id": str(settings.get("preferred_video_provider_id") or settings.get("default_video_provider_id") or ""),
            "preferred_video_model": str(settings.get("preferred_video_model") or ""),
            "custom_fields": _normalize_custom_fields(settings.get("custom_fields")),
        },
        "cast_library": [],
        "scene_asset_pool": [],
        "scenes": [],
        "custom_fields": {},
        "composition_patch_requests": [],
    }


def build_video_composition_from_storyboard(
    project_id: str,
    workspace_profile: str,
    storyboard_text: str,
    global_settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    storyboard_payload = parse_storyboard_payload(storyboard_text)
    composition = default_video_composition(project_id, workspace_profile, global_settings)
    video_profile = storyboard_payload.get("video_profile") or {}
    composition["global_settings"] = {
        **composition["global_settings"],
        "duration_seconds": int(video_profile.get("duration_seconds") or composition["global_settings"]["duration_seconds"]),
        "scene_duration_seconds": int(video_profile.get("scene_duration_seconds") or composition["global_settings"]["scene_duration_seconds"]),
        "resolution": str(video_profile.get("resolution") or composition["global_settings"]["resolution"]),
        "aspect_ratio": str(video_profile.get("aspect_ratio") or composition["global_settings"]["aspect_ratio"]),
        "subtitle_enabled": bool(video_profile.get("subtitle_enabled", composition["global_settings"]["subtitle_enabled"])),
        "preferred_video_model": str(video_profile.get("preferred_model") or composition["global_settings"]["preferred_video_model"]),
    }
    for index, scene in enumerate(storyboard_payload["scenes"], start=1):
        composition["scenes"].append(
            {
                "scene_id": scene.get("scene_key") or scene.get("scene_id") or f"scene_{index:03d}",
                "sequence": index,
                "title": scene.get("scene_title") or scene.get("goal") or f"場景 {index}",
                "goal": scene.get("scene_title") or scene.get("goal") or f"場景 {index}",
                "duration_seconds": int(scene.get("duration") or 8),
                "narration": scene.get("narration") or "",
                "subtitle": scene.get("subtitle") or scene.get("narration") or "",
                "visual_prompt": scene.get("prompt") or scene.get("visual_prompt") or "",
                "cast_refs": [],
                "asset_refs": [],
                "custom_fields": {},
                "render_state": "draft",
                "repair_state": {
                    "revision": 0,
                    "last_repair_reason": "",
                    "last_repair_at": None,
                },
            }
        )
    return composition


def parse_video_composition_text(
    project_id: str,
    workspace_profile: str,
    composition_text: str,
    fallback_storyboard_text: str = "",
    global_settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if composition_text.strip():
        try:
            parsed = json.loads(composition_text)
        except json.JSONDecodeError as exc:
            raise ValueError("invalid composition payload") from exc
        if not isinstance(parsed, dict) or not isinstance(parsed.get("scenes"), list):
            raise ValueError("invalid composition payload")
        composition = default_video_composition(project_id, workspace_profile, global_settings)
        composition["project_id"] = parsed.get("project_id") or project_id
        composition["workspace_profile"] = parsed.get("workspace_profile") or workspace_profile
        composition["composition_version"] = str(parsed.get("composition_version") or "v2")
        raw_global = parsed.get("global_settings") or {}
        composition["global_settings"] = {
            **composition["global_settings"],
            **{
                "duration_seconds": int(raw_global.get("duration_seconds") or composition["global_settings"]["duration_seconds"]),
                "scene_duration_seconds": int(raw_global.get("scene_duration_seconds") or composition["global_settings"]["scene_duration_seconds"]),
                "resolution": str(raw_global.get("resolution") or composition["global_settings"]["resolution"]),
                "aspect_ratio": str(raw_global.get("aspect_ratio") or composition["global_settings"]["aspect_ratio"]),
                "subtitle_enabled": bool(raw_global.get("subtitle_enabled", composition["global_settings"]["subtitle_enabled"])),
                "subtitle_language": str(raw_global.get("subtitle_language") or composition["global_settings"]["subtitle_language"]),
                "font_family": str(raw_global.get("font_family") or composition["global_settings"]["font_family"]),
                "preferred_video_provider_id": str(raw_global.get("preferred_video_provider_id") or composition["global_settings"]["preferred_video_provider_id"]),
                "preferred_video_model": str(raw_global.get("preferred_video_model") or composition["global_settings"]["preferred_video_model"]),
                "custom_fields": _normalize_custom_fields(raw_global.get("custom_fields")),
            },
        }
        composition["cast_library"] = [
            {
                "cast_id": str(item.get("cast_id") or f"cast-{index}"),
                "name": str(item.get("name") or f"角色 {index}"),
                "avatar_asset_id": str(item.get("avatar_asset_id") or ""),
                "voice_asset_id": str(item.get("voice_asset_id") or ""),
                "role": str(item.get("role") or "main"),
                "notes": str(item.get("notes") or ""),
                "custom_fields": _normalize_custom_fields(item.get("custom_fields")),
            }
            for index, item in enumerate(parsed.get("cast_library") or [], start=1)
            if isinstance(item, dict)
        ]
        composition["scene_asset_pool"] = [
            {
                "asset_binding_id": str(item.get("asset_binding_id") or f"binding-{index}"),
                "asset_id": str(item.get("asset_id") or ""),
                "label": str(item.get("label") or f"素材 {index}"),
                "asset_type": str(item.get("asset_type") or "reference_image"),
                "placement_hint": str(item.get("placement_hint") or "inline"),
                "notes": str(item.get("notes") or ""),
                "source": str(item.get("source") or ""),
                "custom_fields": _normalize_custom_fields(item.get("custom_fields")),
            }
            for index, item in enumerate(parsed.get("scene_asset_pool") or [], start=1)
            if isinstance(item, dict)
        ]
        composition["scenes"] = [
            {
                "scene_id": str(item.get("scene_id") or item.get("scene_key") or f"scene_{index:03d}"),
                "sequence": int(item.get("sequence") or index),
                "title": str(item.get("title") or item.get("scene_title") or item.get("goal") or f"場景 {index}"),
                "goal": str(item.get("goal") or item.get("title") or item.get("scene_title") or f"場景 {index}"),
                "duration_seconds": int(item.get("duration_seconds") or item.get("duration") or composition["global_settings"]["scene_duration_seconds"]),
                "narration": str(item.get("narration") or ""),
                "subtitle": str(item.get("subtitle") or item.get("narration") or ""),
                "visual_prompt": str(item.get("visual_prompt") or item.get("prompt") or ""),
                "cast_refs": [str(value) for value in (item.get("cast_refs") or [])],
                "asset_refs": [str(value) for value in (item.get("asset_refs") or [])],
                "custom_fields": _normalize_custom_fields(item.get("custom_fields")),
                "render_state": str(item.get("render_state") or "draft"),
                "repair_state": {
                    "revision": int((item.get("repair_state") or {}).get("revision") or 0),
                    "last_repair_reason": str((item.get("repair_state") or {}).get("last_repair_reason") or ""),
                    "last_repair_at": (item.get("repair_state") or {}).get("last_repair_at"),
                },
            }
            for index, item in enumerate(parsed.get("scenes") or [], start=1)
            if isinstance(item, dict)
        ]
        composition["custom_fields"] = _normalize_custom_fields(parsed.get("custom_fields"))
        composition["composition_patch_requests"] = [
            {
                "patch_id": str(item.get("patch_id") or f"patch-{index}"),
                "scene_id": str(item.get("scene_id") or ""),
                "mode": "single_scene_repair",
                "reason": str(item.get("reason") or ""),
                "fields_changed": [str(value) for value in (item.get("fields_changed") or [])],
                "status": str(item.get("status") or "queued"),
                "created_at": str(item.get("created_at") or now()),
            }
            for index, item in enumerate(parsed.get("composition_patch_requests") or [], start=1)
            if isinstance(item, dict)
        ]
        return composition

    return build_video_composition_from_storyboard(project_id, workspace_profile, fallback_storyboard_text, global_settings)


def build_render_request_from_composition(
    composition: dict[str, Any],
    selected_scene_ids: list[str] | None = None,
) -> dict[str, Any]:
    global_settings = composition.get("global_settings") or {}
    cast_by_id = {item["cast_id"]: item for item in composition.get("cast_library") or [] if isinstance(item, dict) and item.get("cast_id")}
    asset_by_id = {
        item["asset_binding_id"]: item for item in composition.get("scene_asset_pool") or [] if isinstance(item, dict) and item.get("asset_binding_id")
    }
    scene_ids = set(selected_scene_ids or [])
    scenes = composition.get("scenes") or []
    selected_scenes = scenes if not scene_ids else [scene for scene in scenes if scene.get("scene_id") in scene_ids]

    return {
        "model": global_settings.get("preferred_video_model") or "",
        "resolution": global_settings.get("resolution") or "1280x720",
        "aspect_ratio": global_settings.get("aspect_ratio") or "16:9",
        "subtitle": {
            "enable": bool(global_settings.get("subtitle_enabled", True)),
            "language": global_settings.get("subtitle_language") or "繁體中文",
            "font_family": global_settings.get("font_family") or "Noto Sans TC",
        },
        "scenes": [
            {
                "scene_key": scene.get("scene_id"),
                "scene_title": scene.get("title") or scene.get("goal"),
                "prompt": scene.get("visual_prompt") or "",
                "narration": scene.get("narration") or "",
                "subtitle": scene.get("subtitle") or scene.get("narration") or "",
                "duration": int(scene.get("duration_seconds") or global_settings.get("scene_duration_seconds") or 8),
                "cast": [cast_by_id[cast_id] for cast_id in scene.get("cast_refs") or [] if cast_id in cast_by_id],
                "assets": [asset_by_id[asset_id] for asset_id in scene.get("asset_refs") or [] if asset_id in asset_by_id],
                "custom_fields": _normalize_custom_fields(scene.get("custom_fields")),
            }
            for scene in selected_scenes
        ],
        "async": True,
    }
