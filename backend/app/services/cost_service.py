from __future__ import annotations

import json
import uuid
from typing import Any

from ..config import TEXT_PRICING, VIDEO_PRICING
from ..db import now


def create_ledger(db, project_id: str, category: str, item_ref_id: str, amount: float, detail: dict[str, Any]) -> None:
    db.execute(
        "insert into cost_ledgers (id, project_id, category, item_ref_id, amount, detail_json, created_at) values (?, ?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), project_id, category, item_ref_id, amount, json.dumps(detail, ensure_ascii=False), now()),
    )


def text_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    price_in, price_out = TEXT_PRICING.get(model, TEXT_PRICING["gpt-4.1-mini"])
    return round((input_tokens / 1_000_000 * price_in) + (output_tokens / 1_000_000 * price_out), 6)


def scene_cost(model: str) -> float:
    return round(VIDEO_PRICING.get(model, VIDEO_PRICING["generic-video-v1"]) + 0.04, 2)
