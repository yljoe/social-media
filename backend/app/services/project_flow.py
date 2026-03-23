from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from ..db import connect, decode_row


def get_project(project_id: str) -> dict[str, Any]:
    db = connect()
    row = db.execute("select * from projects where id = ?", (project_id,)).fetchone()
    db.close()
    item = decode_row(row)
    if item is None:
        raise HTTPException(status_code=404, detail="project not found")
    return item
