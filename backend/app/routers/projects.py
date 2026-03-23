from __future__ import annotations

import json
import shutil
import uuid

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import FileResponse

from ..config import GDRIVE_MOCK_DIR, STORAGE_DIR, SUPABASE_MOCK_DIR
from ..db import connect, decode_row, now
from ..schemas import (
    ApiResponse,
    CostSummaryPayload,
    FilePathPayload,
    FileRenamePayload,
    FileUpdatePayload,
    MergePayload,
    MetadataPayload,
    ProjectCreate,
    ProjectUpdate,
    SceneBatchRerunPayload,
    StorageRebindPayload,
    TaskInput,
    TextGenerate,
    VideoCompositionPayload,
    VideoPrepare,
    VideoRender,
    VideoSceneRepair,
)
from ..services import (
    build_render_request_from_composition,
    build_video_composition_from_storyboard,
    call_generic_video_provider,
    create_ledger,
    create_mail,
    create_quiz,
    create_storyboard,
    default_video_composition,
    ensure_storage_binding,
    estimate_tokens,
    get_asset,
    get_default_provider,
    get_project,
    get_project_dir,
    get_provider,
    get_storage_policy,
    get_video_project_dir,
    list_files,
    log_provider_call,
    maybe_call_openai,
    normalize_workspace_profile,
    parse_storyboard_payload,
    parse_storyboard_text,
    parse_video_composition_text,
    read_project_file,
    rename_project_file,
    rebind_project_storage,
    resolve_project_file,
    scene_cost,
    delete_project_file,
    sync_storage_artifact,
    text_cost,
    update_project_file,
    write_artifact,
)


router = APIRouter()


def _delete_project_records(db, project_id: str) -> None:
    tables = [
        "storyboard_scenes",
        "text_generation_jobs",
        "scene_render_runs",
        "scene_outputs",
        "merge_jobs",
        "final_videos",
        "cost_ledgers",
        "storage_bindings",
        "provider_call_logs",
    ]
    for table in tables:
        db.execute(f"delete from {table} where project_id = ?", (project_id,))
    db.execute("delete from projects where id = ?", (project_id,))


def _remove_project_directories(project_id: str) -> None:
    for root in (STORAGE_DIR, GDRIVE_MOCK_DIR, SUPABASE_MOCK_DIR):
        if not root.exists():
            continue
        for path in root.rglob(project_id):
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)


def _workspace_profile_exists(workspace_profile: str) -> bool:
    db = connect()
    row = db.execute("select id from workspace_profiles where profile_key = ?", (workspace_profile,)).fetchone()
    db.close()
    return row is not None


def _project_workspace_profile(project_id: str) -> str:
    project = get_project(project_id)
    return normalize_workspace_profile(project.get("workspace_profile"))


def _workspace_profile_settings(workspace_profile: str) -> dict:
    db = connect()
    row = db.execute("select * from workspace_profiles where profile_key = ?", (workspace_profile,)).fetchone()
    db.close()
    profile = decode_row(row)
    return profile.get("settings_json") if profile else {}


def _load_project_composition(project_id: str, workspace_profile: str) -> dict | None:
    try:
        artifact = read_project_file(project_id, "control/video_composition.json", workspace_profile)
    except HTTPException:
        return None
    if not artifact.get("content"):
        return None
    try:
        return json.loads(artifact["content"])
    except json.JSONDecodeError:
        return None


def _save_project_composition(project_id: str, workspace_profile: str, composition: dict) -> None:
    write_artifact(project_id, "control/video_composition.json", composition, workspace_profile)


def _composition_scene_changed_fields(before_scene: dict, after_scene: dict) -> list[str]:
    changed: list[str] = []
    for key in ("title", "goal", "duration_seconds", "narration", "subtitle", "visual_prompt", "cast_refs", "asset_refs"):
        if before_scene.get(key) != after_scene.get(key):
            changed.append(key)
    if before_scene.get("custom_fields") != after_scene.get("custom_fields"):
        changed.append("custom_fields")
    return changed


def _rerun_single_scene(project_id: str, scene_key: str, workspace_profile: str) -> dict:
    db = connect()
    row = db.execute("select * from storyboard_scenes where project_id = ? and scene_key = ?", (project_id, scene_key)).fetchone()
    db.close()
    scene = decode_row(row)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"scene not found: {scene_key}")

    result = video_render(project_id, VideoRender(render_request={"scenes": [scene]}), workspace_profile)
    db = connect()
    create_ledger(db, project_id, "scene_rerun", scene_key, 0, {"scene_key": scene_key})
    db.commit()
    db.close()
    return result.data


@router.get("/projects", response_model=ApiResponse)
def projects_list() -> ApiResponse:
    db = connect()
    rows = db.execute("select * from projects order by updated_at desc").fetchall()
    db.close()
    return ApiResponse(data=[decode_row(row) for row in rows])


@router.post("/projects", response_model=ApiResponse)
def projects_create(payload: ProjectCreate, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = normalize_workspace_profile(payload.workspace_profile or x_workspace_profile)
    if not _workspace_profile_exists(workspace_profile):
        raise HTTPException(status_code=400, detail="workspace profile not found")
    project_id = str(uuid.uuid4())
    timestamp = now()
    db = connect()
    db.execute(
        "insert into projects (id, name, description, workspace_profile, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
        (project_id, payload.name, payload.description, workspace_profile, "draft", timestamp, timestamp),
    )
    db.commit()
    db.close()

    get_project_dir(project_id, workspace_profile)
    project = get_project(project_id)
    project["storage_binding"] = ensure_storage_binding(project_id, workspace_profile)
    return ApiResponse(message="project created", data=project)


@router.put("/projects/{project_id}", response_model=ApiResponse)
def projects_update(project_id: str, payload: ProjectUpdate) -> ApiResponse:
    get_project(project_id)
    workspace_profile = normalize_workspace_profile(payload.workspace_profile)
    if not _workspace_profile_exists(workspace_profile):
        raise HTTPException(status_code=400, detail="workspace profile not found")
    timestamp = now()
    db = connect()
    db.execute(
        "update projects set name = ?, description = ?, workspace_profile = ?, updated_at = ? where id = ?",
        (payload.name, payload.description, workspace_profile, timestamp, project_id),
    )
    db.commit()
    row = db.execute("select * from projects where id = ?", (project_id,)).fetchone()
    db.close()
    return ApiResponse(message="project updated", data=decode_row(row))


@router.delete("/projects/{project_id}", response_model=ApiResponse)
def projects_delete(project_id: str) -> ApiResponse:
    project = get_project(project_id)
    db = connect()
    _delete_project_records(db, project_id)
    db.commit()
    db.close()
    _remove_project_directories(project_id)
    return ApiResponse(message="project deleted", data={"id": project_id, "name": project["name"]})


@router.get("/projects/{project_id}", response_model=ApiResponse)
def projects_detail(project_id: str, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    project = get_project(project_id)
    workspace_profile = normalize_workspace_profile(project.get("workspace_profile") or x_workspace_profile)
    storage_binding = ensure_storage_binding(project_id, workspace_profile)
    storage_provider = get_provider(storage_binding["provider_id"])
    storage_policy = get_storage_policy(workspace_profile)
    latest_video_composition = _load_project_composition(project_id, workspace_profile)
    latest_render_request = None
    try:
        render_request_file = read_project_file(project_id, "control/render_request.json", workspace_profile)
        latest_render_request = json.loads(render_request_file["content"]) if render_request_file.get("content") else None
    except (HTTPException, json.JSONDecodeError):
        latest_render_request = None

    db = connect()
    scenes = [
        decode_row(row)
        for row in db.execute(
            "select * from storyboard_scenes where project_id = ? order by scene_key asc",
            (project_id,),
        ).fetchall()
    ]
    latest_text_job = decode_row(
        db.execute(
            "select * from text_generation_jobs where project_id = ? order by created_at desc limit 1",
            (project_id,),
        ).fetchone()
    )
    latest_merge = decode_row(
        db.execute(
            "select * from merge_jobs where project_id = ? order by created_at desc limit 1",
            (project_id,),
        ).fetchone()
    )
    latest_final_video = decode_row(
        db.execute(
            "select * from final_videos where project_id = ? order by created_at desc limit 1",
            (project_id,),
        ).fetchone()
    )
    db.close()

    return ApiResponse(
        data={
            "project": project,
            "scenes": scenes,
            "latest_text_job": latest_text_job,
            "latest_merge": latest_merge,
            "latest_final_video": latest_final_video,
            "latest_video_composition": latest_video_composition,
            "latest_render_request": latest_render_request,
            "storage_binding": storage_binding,
            "storage_provider": storage_provider,
            "storage_policy": storage_policy,
        }
    )


@router.post("/projects/{project_id}/text-generate", response_model=ApiResponse)
def text_generate(
    project_id: str,
    payload: TextGenerate,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    project = get_project(project_id)
    workspace_profile = normalize_workspace_profile(project.get("workspace_profile") or x_workspace_profile)
    provider = get_default_provider("text_llm", workspace_profile)
    if payload.text_provider_id:
        provider = get_provider(payload.text_provider_id, workspace_profile)

    model = payload.text_model or provider["model"]
    source_text = payload.raw_text or payload.topic or project["name"]
    task_input = TaskInput(
        task_id=project_id,
        topic=payload.topic or project["name"],
        scenario=payload.scenario,
        target_audience=payload.target_audience,
        language=payload.language,
        video_style=payload.video_style,
        avatar_id=payload.avatar_id,
        voice_id=payload.voice_id,
        run_mode=payload.run_mode,
        scene_id=payload.scene_id,
        budget_limit=payload.budget_limit,
    )

    request_prompt = (
        f"topic: {task_input.topic}\n"
        f"scenario: {task_input.scenario}\n"
        f"source: {source_text}\n"
        f"audience: {task_input.target_audience}\n"
        f"language: {task_input.language}\n"
        f"video_style: {task_input.video_style}\n"
        "return a concise traditional chinese production brief"
    )
    llm_summary = maybe_call_openai(provider, model, request_prompt)
    llm_usage = {
        "provider_id": provider["id"],
        "provider_name": provider["name"],
        "model": model,
    }

    storyboard = (
        create_storyboard(
            task_input,
            source_text,
            payload.total_duration_seconds,
            payload.scene_duration_seconds,
            payload.scene_count,
            llm_usage=llm_usage,
        )
        if payload.generate_storyboard
        else None
    )
    template = get_asset(payload.mail_template_id)
    email_payload = (
        create_mail(task_input, task_input.topic, task_input.target_audience, template["name"] if template else None, llm_usage=llm_usage)
        if payload.generate_mail
        else None
    )
    quiz_payload = create_quiz(task_input) if payload.generate_quiz else None

    input_tokens = estimate_tokens(json.dumps(payload.model_dump(), ensure_ascii=False))
    output_json = {
        "task_input": task_input.model_dump(),
        "storyboard": storyboard,
        "email_payload": email_payload,
        "quiz": quiz_payload,
    }
    output_tokens = estimate_tokens(json.dumps(output_json, ensure_ascii=False))
    estimated_cost = text_cost(model, input_tokens, output_tokens)
    llm_usage["input_tokens"] = input_tokens
    llm_usage["output_tokens"] = output_tokens

    metadata = MetadataPayload(
        task_id=task_input.task_id,
        project_id=project_id,
        workspace_profile=workspace_profile,
        generation_status="draft_ready",
        validated_at=now(),
    ).model_dump()
    cost_summary = CostSummaryPayload(
        task_id=task_input.task_id,
        currency=task_input.budget_limit.currency,
        text_generation_cost=estimated_cost,
        scene_generation_cost=0.0,
        tts_cost=0.0,
        subtitle_cost=0.0,
        merge_cost=0.0,
        grand_total=estimated_cost,
        budget_limit=task_input.budget_limit.max_total_cost,
        within_budget=estimated_cost <= task_input.budget_limit.max_total_cost,
    ).model_dump()

    response_json = {
        "task_input": task_input.model_dump(),
        "storyboard": storyboard,
        "email_payload": email_payload,
        "quiz": quiz_payload,
        "metadata": metadata,
        "cost_summary": cost_summary,
        "llm_summary": llm_summary["choices"][0]["message"]["content"] if llm_summary else None,
    }

    job_id = str(uuid.uuid4())
    timestamp = now()
    db = connect()
    db.execute(
        """
        insert into text_generation_jobs
        (id, project_id, provider_id, model, request_json, response_json, input_tokens, output_tokens, estimated_cost, latency_ms, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            job_id,
            project_id,
            provider["id"],
            model,
            json.dumps(payload.model_dump(), ensure_ascii=False),
            json.dumps(response_json, ensure_ascii=False),
            input_tokens,
            output_tokens,
            estimated_cost,
            900,
            timestamp,
        ),
    )
    log_provider_call(
        db,
        provider["id"],
        provider["provider_type"],
        project_id,
        "text.generate",
        {"model": model, "prompt": request_prompt},
        llm_summary or {"mode": "mock", "reason": "no_api_key_or_request_failed"},
        "completed" if llm_summary else "mock",
    )
    db.execute("delete from storyboard_scenes where project_id = ?", (project_id,))
    if storyboard:
        for scene in storyboard["scenes"]:
            db.execute(
                """
                insert into storyboard_scenes
                (id, project_id, scene_key, scene_title, prompt, narration, subtitle, duration, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    project_id,
                    scene["scene_id"],
                    scene["goal"],
                    scene["visual_prompt"],
                    scene["narration"],
                    scene["subtitle"],
                    scene["duration_seconds"],
                    timestamp,
                ),
            )
    db.execute("update projects set status = ?, updated_at = ? where id = ?", ("text_ready", timestamp, project_id))
    create_ledger(
        db,
        project_id,
        "text_generation",
        job_id,
        estimated_cost,
        {"model": model, "input_tokens": input_tokens, "output_tokens": output_tokens},
    )
    db.commit()
    db.close()

    write_artifact(project_id, "input/task_input.json", task_input.model_dump(), workspace_profile)
    if payload.raw_text:
        write_artifact(project_id, "input/source_article.txt", payload.raw_text, workspace_profile)
    if storyboard:
        write_artifact(project_id, "text/storyboard.json", storyboard, workspace_profile)
    if email_payload:
        write_artifact(project_id, "text/email_payload.json", email_payload, workspace_profile)
        write_artifact(project_id, "text/mail_preview.html", email_payload["html_body"], workspace_profile)
    if quiz_payload:
        write_artifact(project_id, "text/quiz.json", quiz_payload, workspace_profile)
    write_artifact(project_id, "text/metadata.json", metadata, workspace_profile)
    write_artifact(project_id, "text/cost_summary.json", cost_summary, workspace_profile)
    write_artifact(
        project_id,
        "control/token_usage.json",
        {"text_job_id": job_id, "input_tokens": input_tokens, "output_tokens": output_tokens},
        workspace_profile,
    )

    return ApiResponse(
        message="text package generated",
        data={
            "project_id": project_id,
            "job_id": job_id,
            **response_json,
            "cost": {
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "estimated_cost": estimated_cost,
            },
        },
    )


@router.post("/projects/{project_id}/video-prepare", response_model=ApiResponse)
def video_prepare(project_id: str, payload: VideoPrepare, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    get_project(project_id)
    settings = _workspace_profile_settings(workspace_profile)
    composition = parse_video_composition_text(
        project_id,
        workspace_profile,
        payload.composition_json_text,
        payload.storyboard_text,
        settings,
    )
    composition["global_settings"] = {
        **composition.get("global_settings", {}),
        "scene_duration_seconds": int(payload.duration or composition["global_settings"].get("scene_duration_seconds") or 8),
        "resolution": payload.resolution or composition["global_settings"].get("resolution") or "1280x720",
        "aspect_ratio": payload.aspect_ratio or composition["global_settings"].get("aspect_ratio") or "16:9",
        "subtitle_enabled": payload.subtitle_enabled,
        "subtitle_language": payload.subtitle_language or composition["global_settings"].get("subtitle_language") or "繁體中文",
        "font_family": payload.subtitle_font_family or composition["global_settings"].get("font_family") or "Noto Sans TC",
    }
    selected_scene_ids = [scene_id for scene_id in payload.selected_scene_ids if scene_id]
    if payload.execute_all or not selected_scene_ids:
        selected_scene_ids = [scene["scene_id"] for scene in composition.get("scenes") or []]
    render_request = build_render_request_from_composition(composition, selected_scene_ids)
    subtitle_payload = render_request.get("subtitle") or {}
    subtitle_payload.update(
        {
            "position": payload.subtitle_position,
            "color": payload.subtitle_color,
            "size": payload.subtitle_size,
        }
    )
    render_request["subtitle"] = subtitle_payload
    render_request["audio"] = {
        "speed": payload.speed,
        "language": payload.subtitle_language,
    }
    if payload.apply_scene1_to_all and render_request["scenes"]:
        first_scene = render_request["scenes"][0]
        for scene in render_request["scenes"]:
            scene["duration"] = first_scene["duration"]
            scene["visual_prompt"] = first_scene.get("visual_prompt", scene.get("visual_prompt", ""))
    for scene in composition.get("scenes") or []:
        if scene["scene_id"] in selected_scene_ids:
            scene["render_state"] = "ready"
    write_artifact(project_id, "control/render_request.json", render_request, workspace_profile)
    _save_project_composition(project_id, workspace_profile, composition)
    return ApiResponse(
        message="video request prepared",
        data={
            "scene_count": len(composition.get("scenes") or []),
            "selected_scene_ids": selected_scene_ids,
            "scenes": [scene for scene in composition.get("scenes") or [] if scene["scene_id"] in selected_scene_ids],
            "composition": composition,
            "render_request": render_request,
        },
    )


@router.post("/projects/{project_id}/video-render", response_model=ApiResponse)
def video_render(
    project_id: str,
    payload: VideoRender,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    get_project(project_id)
    provider = get_default_provider("video_llm", workspace_profile)
    if payload.provider_id:
        provider = get_provider(payload.provider_id, workspace_profile)
    composition = _load_project_composition(project_id, workspace_profile)

    outputs: list[dict[str, object]] = []
    timestamp = now()

    for scene in payload.render_request.get("scenes", []):
        adapter_result = call_generic_video_provider(provider, payload.render_request, scene)
        run_id = str(uuid.uuid4())
        total_cost = scene_cost(provider["model"])
        scene_dir = get_video_project_dir(project_id, workspace_profile) / "scenes" / scene["scene_key"]
        scene_dir.mkdir(parents=True, exist_ok=True)

        mp4 = scene_dir / f"{scene['scene_key']}.mp4"
        mp3 = scene_dir / f"{scene['scene_key']}.mp3"
        srt = scene_dir / f"{scene['scene_key']}.srt"
        mp4.write_text(f"mock video for {scene['scene_key']} via {provider['name']}", encoding="utf-8")
        mp3.write_text(f"mock audio for {scene['scene_key']} via {provider['name']}", encoding="utf-8")
        srt.write_text(scene.get("subtitle", ""), encoding="utf-8")
        sync_storage_artifact(project_id, f"scenes/{scene['scene_key']}/{scene['scene_key']}.mp4", mp4, "video", workspace_profile)
        sync_storage_artifact(project_id, f"scenes/{scene['scene_key']}/{scene['scene_key']}.mp3", mp3, "video", workspace_profile)
        sync_storage_artifact(project_id, f"scenes/{scene['scene_key']}/{scene['scene_key']}.srt", srt, "video", workspace_profile)

        db = connect()
        db.execute(
            """
            insert into scene_render_runs
            (id, project_id, scene_key, provider_id, request_json, response_json, cost_json, status, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                project_id,
                scene["scene_key"],
                provider["id"],
                json.dumps(adapter_result["request_payload"], ensure_ascii=False),
                json.dumps(adapter_result["response_payload"], ensure_ascii=False),
                json.dumps({"scene_total_cost": total_cost, "adapter_mode": adapter_result["mode"]}, ensure_ascii=False),
                "completed",
                timestamp,
            ),
        )
        db.execute(
            """
            insert into scene_outputs
            (id, project_id, scene_key, run_id, mp4_path, mp3_path, srt_path, metadata_json, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                project_id,
                scene["scene_key"],
                run_id,
                str(mp4),
                str(mp3),
                str(srt),
                json.dumps(
                    {
                        "status": "completed",
                        "provider_name": provider["name"],
                        "adapter_mode": adapter_result["mode"],
                        "external_job_id": adapter_result["job_id"],
                    },
                    ensure_ascii=False,
                ),
                timestamp,
            ),
        )
        log_provider_call(
            db,
            provider["id"],
            provider["provider_type"],
            project_id,
            "video.render_scene",
            adapter_result["request_payload"],
            adapter_result["response_payload"],
            adapter_result["status"],
        )
        create_ledger(
            db,
            project_id,
            "scene_generation",
            run_id,
            total_cost,
            {"scene_key": scene["scene_key"], "provider_model": provider["model"], "adapter_mode": adapter_result["mode"]},
        )
        outputs.append(
            {
                "scene_key": scene["scene_key"],
                "run_id": run_id,
                "status": "completed",
                "provider_name": provider["name"],
                "model": provider["model"],
                "adapter_mode": adapter_result["mode"],
                "external_job_id": adapter_result["job_id"],
                "cost": {"scene_total_cost": total_cost},
                "output_files": {"mp4": str(mp4), "mp3": str(mp3), "srt": str(srt)},
            }
        )
        if composition:
            for composition_scene in composition.get("scenes") or []:
                if composition_scene.get("scene_id") == scene["scene_key"]:
                    composition_scene["render_state"] = "done"
                    repair_state = composition_scene.get("repair_state") or {}
                    composition_scene["repair_state"] = {
                        "revision": int(repair_state.get("revision") or 0),
                        "last_repair_reason": repair_state.get("last_repair_reason") or "",
                        "last_repair_at": repair_state.get("last_repair_at"),
                    }
                    break
        db.commit()
        db.close()

    db = connect()
    db.execute("update projects set status = ?, updated_at = ? where id = ?", ("video_generated", timestamp, project_id))
    db.commit()
    db.close()
    if composition:
        _save_project_composition(project_id, workspace_profile, composition)
    write_artifact(project_id, "control/scene_render_summary.json", outputs, workspace_profile)
    return ApiResponse(
        message="scenes generated",
        data={
            "outputs": outputs,
            "summary": {
                "scene_count": len(outputs),
                "estimated_cost": round(sum(item["cost"]["scene_total_cost"] for item in outputs), 2),
            },
        },
    )


@router.post("/projects/{project_id}/video-repair-scene", response_model=ApiResponse)
def video_repair_scene(
    project_id: str,
    payload: VideoSceneRepair,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    get_project(project_id)
    settings = _workspace_profile_settings(workspace_profile)
    composition = parse_video_composition_text(
        project_id,
        workspace_profile,
        payload.composition_json_text,
        "",
        settings,
    )
    target_scene = next((scene for scene in composition.get("scenes") or [] if scene.get("scene_id") == payload.scene_id), None)
    if target_scene is None:
        raise HTTPException(status_code=404, detail="scene not found in composition")

    before_scene = json.loads(json.dumps(target_scene, ensure_ascii=False))
    repair_state = target_scene.get("repair_state") or {}
    target_scene["repair_state"] = {
        "revision": int(repair_state.get("revision") or 0) + 1,
        "last_repair_reason": payload.reason,
        "last_repair_at": now(),
    }
    target_scene["render_state"] = "queued"
    patch_request = {
        "patch_id": f"patch-{target_scene['scene_id']}-{uuid.uuid4().hex[:8]}",
        "scene_id": target_scene["scene_id"],
        "mode": "single_scene_repair",
        "reason": payload.reason,
        "fields_changed": _composition_scene_changed_fields(before_scene, target_scene),
        "status": "queued",
        "created_at": now(),
    }
    composition.setdefault("composition_patch_requests", []).append(patch_request)

    render_request = build_render_request_from_composition(composition, [payload.scene_id])
    provider_id = payload.provider_id or composition.get("global_settings", {}).get("preferred_video_provider_id") or None
    result = video_render(project_id, VideoRender(provider_id=provider_id, render_request=render_request), workspace_profile)
    patch_request["status"] = "completed"
    target_scene["render_state"] = "done"
    _save_project_composition(project_id, workspace_profile, composition)
    return ApiResponse(
        message="scene repaired",
        data={
            "scene_id": payload.scene_id,
            "patch_request": patch_request,
            "composition": composition,
            "outputs": result.data.get("outputs", []),
        },
    )


@router.post("/projects/{project_id}/scenes/{scene_key}/rerun", response_model=ApiResponse)
def scene_rerun(project_id: str, scene_key: str, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    return ApiResponse(message="scene rerun complete", data=_rerun_single_scene(project_id, scene_key, workspace_profile))


@router.post("/projects/{project_id}/scenes/rerun", response_model=ApiResponse)
def scene_batch_rerun(
    project_id: str,
    payload: SceneBatchRerunPayload,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    if not payload.scene_ids:
        raise HTTPException(status_code=400, detail="scene_ids required")
    outputs = [_rerun_single_scene(project_id, scene_key, workspace_profile) for scene_key in payload.scene_ids]
    return ApiResponse(
        message="scene batch rerun complete",
        data={
            "scene_ids": payload.scene_ids,
            "count": len(outputs),
            "outputs": outputs,
        },
    )


@router.post("/projects/{project_id}/merge", response_model=ApiResponse)
def project_merge(
    project_id: str,
    payload: MergePayload,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    get_project(project_id)
    db = connect()
    rows = db.execute("select * from scene_outputs where project_id = ? order by scene_key asc", (project_id,)).fetchall()
    outputs = [decode_row(row) for row in rows]
    if payload.scene_ids:
        outputs = [row for row in outputs if row and row["scene_key"] in payload.scene_ids]
    if not outputs:
        db.close()
        raise HTTPException(status_code=400, detail="no scene outputs to merge")

    project_dir = get_video_project_dir(project_id, workspace_profile)
    final_video = project_dir / "video" / "final_video.mp4"
    final_srt = project_dir / "video" / "final_video.srt"
    final_video.write_text("\n".join(item["mp4_path"] for item in outputs if item), encoding="utf-8")
    final_srt.write_text("\n".join(item["srt_path"] for item in outputs if item), encoding="utf-8")
    db.close()
    sync_storage_artifact(project_id, "video/final_video.mp4", final_video, "video", workspace_profile)
    sync_storage_artifact(project_id, "video/final_video.srt", final_srt, "video", workspace_profile)

    merge_id = str(uuid.uuid4())
    final_video_id = str(uuid.uuid4())
    merge_cost = 0.55
    timestamp = now()
    db = connect()
    db.execute(
        "insert into merge_jobs (id, project_id, final_video_path, final_srt_path, cost_json, created_at) values (?, ?, ?, ?, ?, ?)",
        (merge_id, project_id, str(final_video), str(final_srt), json.dumps({"merge_cost": merge_cost}, ensure_ascii=False), timestamp),
    )
    db.execute(
        """
        insert into final_videos (id, project_id, merge_job_id, file_path, srt_path, metadata_json, created_at)
        values (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            final_video_id,
            project_id,
            merge_id,
            str(final_video),
            str(final_srt),
            json.dumps({"scene_count": len(outputs), "source": "merge_job"}, ensure_ascii=False),
            timestamp,
        ),
    )
    create_ledger(db, project_id, "merge", merge_id, merge_cost, {"scene_count": len(outputs)})
    db.execute("update projects set status = ?, updated_at = ? where id = ?", ("merged", timestamp, project_id))
    db.commit()
    db.close()

    write_artifact(
        project_id,
        "video/merge_manifest.json",
        {"final_video_path": str(final_video), "final_srt_path": str(final_srt), "scene_count": len(outputs)},
        workspace_profile,
    )
    return ApiResponse(
        message="merge completed",
        data={
            "merge_id": merge_id,
            "final_video_id": final_video_id,
            "final_video_path": str(final_video),
            "final_srt_path": str(final_srt),
            "merge_cost": merge_cost,
        },
    )


@router.get("/projects/{project_id}/files", response_model=ApiResponse)
def project_files(project_id: str, x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile")) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    ensure_storage_binding(project_id, workspace_profile)
    return ApiResponse(data=list_files(project_id, workspace_profile))


@router.get("/projects/{project_id}/files/content", response_model=ApiResponse)
def project_file_content(
    project_id: str,
    relative_path: str = Query(...),
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    return ApiResponse(data=read_project_file(project_id, relative_path, workspace_profile))


@router.get("/projects/{project_id}/files/raw")
def project_file_raw(
    project_id: str,
    relative_path: str = Query(...),
    download: bool = Query(False),
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
):
    workspace_profile = _project_workspace_profile(project_id)
    path = resolve_project_file(project_id, relative_path, workspace_profile)
    filename = path.name if download else None
    return FileResponse(path, filename=filename)


@router.put("/projects/{project_id}/files/content", response_model=ApiResponse)
def project_file_update(
    project_id: str,
    payload: FileUpdatePayload,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    updated = update_project_file(project_id, payload.relative_path, payload.content, workspace_profile)
    return ApiResponse(message="file updated", data=updated)


@router.put("/projects/{project_id}/files/rename", response_model=ApiResponse)
def project_file_rename(
    project_id: str,
    payload: FileRenamePayload,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    updated = rename_project_file(project_id, payload.relative_path, payload.new_relative_path, workspace_profile)
    return ApiResponse(message="file renamed", data=updated)


@router.delete("/projects/{project_id}/files", response_model=ApiResponse)
def project_file_delete(
    project_id: str,
    payload: FilePathPayload,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    deleted = delete_project_file(project_id, payload.relative_path, workspace_profile)
    return ApiResponse(message="file deleted", data=deleted)


@router.post("/projects/{project_id}/storage/rebind", response_model=ApiResponse)
def project_storage_rebind(
    project_id: str,
    payload: StorageRebindPayload,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    workspace_profile = _project_workspace_profile(project_id)
    binding = rebind_project_storage(project_id, payload.provider_id, payload.move_existing_files, workspace_profile)
    provider = get_provider(binding["provider_id"])
    return ApiResponse(
        message="project storage rebound",
        data={
            "storage_binding": binding,
            "storage_provider": provider,
            "files": list_files(project_id, workspace_profile),
        },
    )


@router.get("/projects/{project_id}/provider-logs", response_model=ApiResponse)
def provider_logs(project_id: str) -> ApiResponse:
    get_project(project_id)
    db = connect()
    rows = db.execute(
        "select * from provider_call_logs where project_id = ? order by created_at desc",
        (project_id,),
    ).fetchall()
    db.close()
    return ApiResponse(data=[decode_row(row) for row in rows])
