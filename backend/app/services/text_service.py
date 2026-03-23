from __future__ import annotations

import math
from typing import Any

from ..schemas import EmailPayload, QuizItem, QuizPayload, StoryboardPayload, StoryboardScenePayload, TaskInput


def estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


def resolve_storyboard_plan(total_duration: int, scene_duration: int, scene_count: int) -> tuple[int, list[int]]:
    resolved_total = max(1, int(total_duration or 24))
    resolved_scene_duration = max(1, int(scene_duration or 8))
    resolved_scene_count = max(0, int(scene_count or 0))

    if resolved_scene_count > 0:
        base_duration = max(1, resolved_total // resolved_scene_count)
        durations = [base_duration for _ in range(resolved_scene_count)]
        durations[-1] += resolved_total - (base_duration * resolved_scene_count)
        return resolved_scene_count, durations

    auto_scene_count = max(1, math.ceil(resolved_total / resolved_scene_duration))
    durations = [resolved_scene_duration for _ in range(auto_scene_count)]
    if auto_scene_count > 1:
        durations[-1] = max(1, resolved_total - (resolved_scene_duration * (auto_scene_count - 1)))
    else:
        durations[0] = resolved_total
    return auto_scene_count, durations


def create_storyboard(
    task_input: TaskInput,
    source: str,
    total_duration: int = 24,
    scene_duration: int = 8,
    scene_count: int = 0,
    llm_usage: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base = source.strip() or task_input.topic.strip() or "社交工程防護訓練"
    resolved_scene_count, durations = resolve_storyboard_plan(total_duration, scene_duration, scene_count)
    sections = [
        (
            "情境建立",
            "建立可信的工作情境，讓觀眾快速進入演練脈絡。",
            "用角色互動帶出事件起點與任務背景。",
        ),
        (
            "風險訊號",
            "指出第一個應該停下來查證的異常訊號。",
            "畫面要讓觀眾一眼看出不合理之處。",
        ),
        (
            "攻擊手法",
            "拆解社交工程如何一步一步降低受害者戒心。",
            "強調攻擊者的話術與流程設計。",
        ),
        (
            "決策瞬間",
            "呈現使用者必須決定是否信任請求的關鍵時刻。",
            "畫面應凸顯點擊前的猶豫與查證動作。",
        ),
        (
            "影響結果",
            "說明錯誤決策帶來的帳號、資料或營運風險。",
            "讓後果具體可視，避免停留在抽象警告。",
        ),
        (
            "正確作法",
            "示範正確回應：停止、查證、通報。",
            "強調標準流程與內部回報管道。",
        ),
        (
            "重點收束",
            "用一句清楚的結論收束整段訓練內容。",
            "讓觀眾記住可執行的安全行為。",
        ),
    ]

    scenes = []
    for index in range(1, resolved_scene_count + 1):
        scene_title, narration, goal = sections[(index - 1) % len(sections)]
        scene_id = f"scene_{index:03d}"
        duration_seconds = durations[index - 1]
        scenes.append(
            StoryboardScenePayload(
                scene_id=scene_id,
                sequence=index,
                duration_seconds=duration_seconds,
                goal=goal,
                visual_prompt=(
                    f"請為主題「{base}」製作漫畫分鏡風格的訓練場景，聚焦「{scene_title}」，"
                    f"時長約 {duration_seconds} 秒，呈現企業內部社交工程演練情境。"
                ),
                onscreen_text=[scene_title, task_input.topic or base],
                narration=narration,
                subtitle=narration,
                camera="medium-shot",
                transition="cut",
                asset_refs=[task_input.avatar_id, task_input.voice_id],
                safety_notes=["避免出現真實個資", "避免展示可直接濫用的釣魚內容"],
                vendor_overrides={},
                llm_usage=llm_usage or {},
            ).model_dump()
        )

    storyboard = StoryboardPayload(
        video_id=f"video-{task_input.task_id}",
        task_id=task_input.task_id,
        title=task_input.topic or base,
        total_duration=sum(item["duration_seconds"] for item in scenes),
        style=task_input.video_style,
        avatar_id=task_input.avatar_id,
        voice_id=task_input.voice_id,
        language=task_input.language,
        video_profile={
            "preferred_vendor": "auto",
            "preferred_model": "",
            "duration_seconds": sum(item["duration_seconds"] for item in scenes),
            "aspect_ratio": "16:9",
            "resolution": "1280x720",
            "frame_rate": 24,
            "audio_enabled": True,
            "subtitle_enabled": True,
            "allowed_vendors": ["openai_sora", "google_veo", "seedance", "runway"],
        },
        vendor_targets={},
        scenes=scenes,
    )
    return storyboard.model_dump()


def create_mail(
    task_input: TaskInput,
    topic: str,
    audience: str,
    template_name: str | None,
    llm_usage: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_topic = topic or task_input.topic or "社交工程演練"
    resolved_audience = audience or task_input.target_audience or "企業內部同仁"
    subject = f"[資安演練通知] {resolved_topic}"
    preview_text = "請閱讀本次演練說明，確認信件內容與回應流程。"
    body_text = (
        f"{resolved_audience} 您好，\n\n"
        f"本次訓練主題為「{resolved_topic}」。請依照內部流程閱讀演練信件，"
        "辨識可疑訊號，並在遇到異常要求時先查證、再回報。\n\n"
        "請勿直接點擊未知連結或開啟未經確認的附件。"
    )
    html_body = (
        "<html><body style=\"font-family:'Noto Sans TC',sans-serif;background:#f6f1e7;padding:24px;\">"
        "<div style=\"max-width:680px;margin:0 auto;background:#fffdf8;border:1px solid #d9ccb7;padding:32px;\">"
        f"<h1>{subject}</h1>"
        f"<p>{preview_text}</p>"
        f"<p>{body_text.replace(chr(10), '<br/>')}</p>"
        "<p>請於完成閱讀後進入訓練頁面確認理解內容。</p>"
        "</div></body></html>"
    )
    mail = EmailPayload(
        email_id=f"email-{task_input.task_id}",
        task_id=task_input.task_id,
        subject=subject,
        preview_text=preview_text,
        body_text=body_text,
        cta_text="開始閱讀演練內容",
        html_body=html_body,
        link_placeholder="{{TRAINING_LINK}}",
        language=task_input.language,
        llm_usage={**(llm_usage or {}), "template_name": template_name or "預設郵件模板"},
    )
    return mail.model_dump()


def create_quiz(task_input: TaskInput) -> dict[str, Any]:
    items = []
    for index in range(1, 11):
        items.append(
            QuizItem(
                question_id=f"q{index:02d}",
                question=f"第 {index} 題：在「{task_input.topic or '社交工程演練'}」情境中，最安全的第一步是什麼？",
                options=[
                    "立即點擊連結以確認內容",
                    "先透過正式管道查證，再決定是否回應",
                    "把訊息轉傳給同事請他代為處理",
                    "直接刪除，不需要留下紀錄",
                ],
                answer="先透過正式管道查證，再決定是否回應",
                explanation="面對可疑要求時，應先透過既有內部管道查證，避免直接與攻擊者互動。",
            ).model_dump()
        )

    quiz = QuizPayload(
        quiz_id=f"quiz-{task_input.task_id}",
        task_id=task_input.task_id,
        language=task_input.language,
        items=items,
    )
    return quiz.model_dump()
