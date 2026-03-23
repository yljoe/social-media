from __future__ import annotations

from fastapi import APIRouter, Query

from ..db import connect, decode_row
from ..schemas import ApiResponse
from ..services import get_project


router = APIRouter()


def build_cost_query(base_sql: str, project_id: str | None = None, date_from: str | None = None, date_to: str | None = None) -> tuple[str, list[str]]:
    clauses: list[str] = []
    params: list[str] = []
    if project_id:
        clauses.append("project_id = ?")
        params.append(project_id)
    if date_from:
        clauses.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("created_at <= ?")
        params.append(date_to)

    if clauses:
        base_sql = f"{base_sql} where " + " and ".join(clauses)
    return base_sql, params


@router.get("/costs", response_model=ApiResponse)
def costs_list(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> ApiResponse:
    db = connect()
    projects = db.execute("select * from projects order by updated_at desc").fetchall()
    result = []
    for project in projects:
        sql, params = build_cost_query("select * from cost_ledgers", project["id"], date_from, date_to)
        sql += " order by created_at desc"
        items = [decode_row(row) for row in db.execute(sql, params).fetchall()]
        result.append(
            {
                "project_id": project["id"],
                "project_name": project["name"],
                "subtotal": round(sum(item["amount"] for item in items if item), 2),
                "items": items,
            }
        )
    db.close()
    return ApiResponse(data=result)


@router.get("/costs/{project_id}", response_model=ApiResponse)
def costs_detail(
    project_id: str,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> ApiResponse:
    get_project(project_id)
    db = connect()
    sql, params = build_cost_query("select * from cost_ledgers", project_id, date_from, date_to)
    sql += " order by created_at desc"
    items = [decode_row(row) for row in db.execute(sql, params).fetchall()]
    db.close()

    subtotal = round(sum(item["amount"] for item in items if item), 2)
    bom = {
        "text_generation": round(sum(item["amount"] for item in items if item and item["category"] == "text_generation"), 2),
        "scene_generation": round(sum(item["amount"] for item in items if item and item["category"] == "scene_generation"), 2),
        "scene_rerun": round(sum(item["amount"] for item in items if item and item["category"] == "scene_rerun"), 2),
        "merge": round(sum(item["amount"] for item in items if item and item["category"] == "merge"), 2),
    }
    return ApiResponse(
        data={
            "project_id": project_id,
            "subtotal": subtotal,
            "bom": bom,
            "items": items,
            "filters": {"date_from": date_from, "date_to": date_to},
        }
    )
