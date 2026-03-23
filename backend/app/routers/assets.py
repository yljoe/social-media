from __future__ import annotations

import json
import mimetypes
import re
import uuid
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from ..config import DATA_DIR
from ..db import connect, decode_row, now
from ..schemas import ApiResponse, AssetImportUrlPayload, AssetPayload
from ..services import normalize_workspace_profile, sync_workspace_asset_artifact


router = APIRouter()
ASSET_UPLOAD_DIR = DATA_DIR / "asset_uploads"
TEXT_EXTENSIONS = {".json", ".txt", ".md", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".csv", ".xml", ".yaml", ".yml", ".prompt"}


def _safe_filename(filename: str) -> str:
    candidate = Path(filename).name.strip() or "asset"
    return re.sub(r"[^A-Za-z0-9._-]+", "_", candidate)


def _asset_storage_path(asset_type: str, filename: str) -> tuple[Path, str]:
    ASSET_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target_dir = ASSET_UPLOAD_DIR / asset_type
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_filename(filename)
    target = target_dir / f"{uuid.uuid4()}-{safe_name}"
    return target, target.relative_to(DATA_DIR).as_posix()


def _extract_text_content(file_path: Path, raw: bytes) -> str:
    if file_path.suffix.lower() not in TEXT_EXTENSIONS:
        return ""
    for encoding in ("utf-8", "utf-8-sig", "big5", "cp950"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return ""


def _persist_asset_record(
    *,
    asset_type: str,
    name: str,
    status: str,
    metadata_json: dict,
    file_path: str,
    content: str,
) -> dict:
    db = connect()
    asset_id = str(uuid.uuid4())
    timestamp = now()
    db.execute(
        """
        insert into asset_records
        (id, asset_type, name, content, file_path, status, metadata_json, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            asset_id,
            asset_type,
            name,
            content,
            file_path,
            status,
            json.dumps(metadata_json, ensure_ascii=False),
            timestamp,
            timestamp,
        ),
    )
    db.commit()
    row = db.execute("select * from asset_records where id = ?", (asset_id,)).fetchone()
    db.close()
    return decode_row(row)


@router.get("/assets", response_model=ApiResponse)
def assets_list() -> ApiResponse:
    db = connect()
    rows = db.execute("select * from asset_records order by asset_type asc, updated_at desc").fetchall()
    db.close()
    return ApiResponse(data=[decode_row(row) for row in rows])


@router.post("/assets", response_model=ApiResponse)
def assets_create(payload: AssetPayload) -> ApiResponse:
    row = _persist_asset_record(
        asset_type=payload.asset_type,
        name=payload.name,
        status=payload.status,
        metadata_json=payload.metadata_json,
        file_path=payload.file_path,
        content=payload.content,
    )
    return ApiResponse(message="asset created", data=row)


@router.put("/assets/{asset_id}", response_model=ApiResponse)
def assets_update(asset_id: str, payload: AssetPayload) -> ApiResponse:
    db = connect()
    existing = db.execute("select * from asset_records where id = ?", (asset_id,)).fetchone()
    if existing is None:
        db.close()
        raise HTTPException(status_code=404, detail="asset not found")
    db.execute(
        """
        update asset_records
        set asset_type = ?, name = ?, content = ?, file_path = ?, status = ?, metadata_json = ?, updated_at = ?
        where id = ?
        """,
        (
            payload.asset_type,
            payload.name,
            payload.content,
            payload.file_path,
            payload.status,
            json.dumps(payload.metadata_json, ensure_ascii=False),
            now(),
            asset_id,
        ),
    )
    db.commit()
    row = db.execute("select * from asset_records where id = ?", (asset_id,)).fetchone()
    db.close()
    return ApiResponse(message="asset updated", data=decode_row(row))


@router.delete("/assets/{asset_id}", response_model=ApiResponse)
def assets_delete(asset_id: str) -> ApiResponse:
    db = connect()
    existing = db.execute("select * from asset_records where id = ?", (asset_id,)).fetchone()
    if existing is None:
        db.close()
        raise HTTPException(status_code=404, detail="asset not found")
    db.execute("delete from asset_records where id = ?", (asset_id,))
    db.commit()
    db.close()
    return ApiResponse(message="asset deleted", data={"id": asset_id})


@router.post("/assets/import/upload", response_model=ApiResponse)
async def assets_import_upload(
    asset_type: str = Form(...),
    name: str = Form(""),
    status: str = Form("active"),
    metadata_json: str = Form("{}"),
    file: UploadFile = File(...),
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    try:
        metadata = json.loads(metadata_json) if metadata_json else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"metadata_json 格式錯誤：{exc.msg}") from exc

    original_name = file.filename or "asset"
    payload = await file.read()
    target_path, relative_path = _asset_storage_path(asset_type, original_name)
    target_path.write_bytes(payload)
    mime_type = file.content_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"
    content = _extract_text_content(target_path, payload)
    metadata.update(
        {
            "source_type": "upload",
            "source_name": original_name,
            "mime_type": mime_type,
            "size_bytes": len(payload),
            "imported_at": now(),
        }
    )
    row = _persist_asset_record(
        asset_type=asset_type,
        name=name.strip() or Path(original_name).stem,
        status=status,
        metadata_json=metadata,
        file_path=relative_path,
        content=content,
    )
    sync_workspace_asset_artifact(relative_path, target_path, normalize_workspace_profile(x_workspace_profile))
    return ApiResponse(message="asset uploaded", data=row)


@router.post("/assets/import/url", response_model=ApiResponse)
def assets_import_url(
    payload: AssetImportUrlPayload,
    x_workspace_profile: str | None = Header(default=None, alias="X-Workspace-Profile"),
) -> ApiResponse:
    request = Request(payload.source_url, headers={"User-Agent": "SocialEngineeringAssetImporter/1.0"})
    try:
        with urlopen(request, timeout=20) as response:
            data = response.read()
            mime_type = response.headers.get_content_type() or "application/octet-stream"
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"無法下載指定網址：{exc}") from exc

    parsed = urlparse(payload.source_url)
    filename = Path(parsed.path).name or "remote-asset"
    target_path, relative_path = _asset_storage_path(payload.asset_type, filename)
    target_path.write_bytes(data)
    content = _extract_text_content(target_path, data)
    metadata = {
        **payload.metadata_json,
        "source_type": "url",
        "source_url": payload.source_url,
        "mime_type": mime_type,
        "size_bytes": len(data),
        "imported_at": now(),
    }
    row = _persist_asset_record(
        asset_type=payload.asset_type,
        name=payload.name.strip() or Path(filename).stem,
        status=payload.status,
        metadata_json=metadata,
        file_path=relative_path,
        content=content,
    )
    sync_workspace_asset_artifact(relative_path, target_path, normalize_workspace_profile(x_workspace_profile))
    return ApiResponse(message="asset imported", data=row)
