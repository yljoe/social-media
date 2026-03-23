import json
import unittest
import uuid
from unittest.mock import Mock, patch

from backend.tests import test_support  # noqa: F401
from fastapi.testclient import TestClient

from backend.app.db import init_db
from backend.app.main import app


class WorkflowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.client = TestClient(app)

    def create_project(self, workspace_profile: str = "shared") -> str:
        response = self.client.post(
            "/api/projects",
            json={
                "name": f"Workflow Test {uuid.uuid4()}",
                "description": "Integration test project",
                "workspace_profile": workspace_profile,
            },
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["data"]["id"]

    def create_workspace_profile(self, name: str, source_profile_key: str = "shared", settings_json: dict | None = None) -> dict:
        response = self.client.post(
            "/api/workspace-profiles",
            json={
                "name": name,
                "description": "Workspace profile for tests",
                "source_profile_key": source_profile_key,
                "settings_json": settings_json
                or {
                    "default_language": "zh-TW",
                    "default_target_audience": "????????",
                    "default_text_provider_id": "",
                    "default_video_provider_id": "",
                    "default_total_duration_seconds": 24,
                    "default_scene_duration_seconds": 8,
                    "default_resolution": "1280x720",
                    "default_aspect_ratio": "16:9",
                    "default_subtitle_enabled": True,
                    "default_subtitle_language": "????",
                    "default_font_family": "Noto Sans TC",
                    "default_render_style_asset_id": "",
                    "default_asset_provider_role": "google-drive",
                    "default_document_provider_role": "supabase-storage",
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["data"]

    def create_provider(self, workspace_profile: str, name: str, provider_type: str = "text_llm", model: str = "gpt-4.1-mini") -> str:
        response = self.client.post(
            "/api/providers",
            headers={"X-Workspace-Profile": workspace_profile},
            json={
                "provider_type": provider_type,
                "name": name,
                "base_url": "https://example.com/provider",
                "api_key": f"{workspace_profile}-token",
                "model": model,
                "region": "global",
                "create_job_path": "/jobs" if provider_type == "video_llm" else "",
                "get_job_path": "/jobs/{job_id}" if provider_type == "video_llm" else "",
                "status": "active",
                "is_default": True,
                "config_json": {},
            },
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["data"]["id"]

    def create_storage_provider(self, workspace_profile: str, name: str, model: str = "supabase-storage") -> str:
        config_json = (
            {
                "project_url": "https://demo.supabase.co",
                "service_role_key": "demo-service-role",
                "storage_bucket": "content-artifacts",
                "metadata_table": "project_artifacts",
            }
            if model == "supabase-storage"
            else {
                "folder_id": "demo-folder-id",
                "service_account_json": '{"type":"service_account","client_email":"demo@example.com"}',
            }
        )
        response = self.client.post(
            "/api/providers",
            headers={"X-Workspace-Profile": workspace_profile},
            json={
                "provider_type": "storage",
                "name": name,
                "base_url": "",
                "api_key": "",
                "model": model,
                "region": "global",
                "create_job_path": "",
                "get_job_path": "",
                "status": "active",
                "is_default": False,
                "config_json": config_json,
            },
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["data"]["id"]

    def build_text_payload(self) -> dict:
        return {
            "input_mode": "topic",
            "topic": "帳號保護與社交工程防護",
            "raw_text": "",
            "scenario": "模擬員工收到要求重設帳號與確認驗證碼的可疑通知。",
            "target_audience": "企業同仁",
            "language": "zh-TW",
            "video_style": "comic",
            "avatar_id": "avatar-default",
            "voice_id": "voice-default",
            "run_mode": "full",
            "scene_id": None,
            "budget_limit": {"currency": "USD", "max_total_cost": 5},
            "total_duration_seconds": 30,
            "scene_duration_seconds": 6,
            "scene_count": 5,
            "text_provider_id": None,
            "text_model": "gpt-4.1-mini",
            "mail_template_id": None,
            "storyboard_template_id": None,
            "generate_storyboard": True,
            "generate_mail": True,
            "generate_quiz": True,
        }

    def test_project_crud(self) -> None:
        project_id = self.create_project()

        update_response = self.client.put(
            f"/api/projects/{project_id}",
            json={"name": "Updated Project", "description": "Updated description"},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["data"]["name"], "Updated Project")

        delete_response = self.client.delete(f"/api/projects/{project_id}")
        self.assertEqual(delete_response.status_code, 200)

        detail_response = self.client.get(f"/api/projects/{project_id}")
        self.assertEqual(detail_response.status_code, 404)

    def test_workspace_profile_crud_and_project_binding(self) -> None:
        created_profile = self.create_workspace_profile(f"profile-{uuid.uuid4().hex[:6]}")
        profile_key = created_profile["profile_key"]

        list_response = self.client.get("/api/workspace-profiles")
        self.assertEqual(list_response.status_code, 200)
        listed_keys = {item["profile_key"] for item in list_response.json()["data"]}
        self.assertIn("shared", listed_keys)
        self.assertIn(profile_key, listed_keys)

        update_response = self.client.put(
            f"/api/workspace-profiles/{created_profile['id']}",
            json={
                "name": "Updated Profile",
                "description": "Updated description",
                "settings_json": {
                    "default_language": "zh-TW",
                    "default_target_audience": "資訊安全團隊",
                    "default_text_provider_id": "",
                    "default_video_provider_id": "",
                    "default_total_duration_seconds": 36,
                    "default_scene_duration_seconds": 6,
                    "default_resolution": "1920x1080",
                    "default_subtitle_enabled": True,
                    "default_subtitle_language": "繁體中文",
                },
            },
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["data"]["name"], "Updated Profile")
        self.assertEqual(update_response.json()["data"]["settings_json"]["default_target_audience"], "資訊安全團隊")
        self.assertEqual(update_response.json()["data"]["settings_json"]["default_total_duration_seconds"], 36)
        self.assertEqual(update_response.json()["data"]["settings_json"]["default_font_family"], "Noto Sans TC")
        self.assertEqual(update_response.json()["data"]["settings_json"]["default_asset_provider_role"], "google-drive")

        project_id = self.create_project(profile_key)
        detail_response = self.client.get(f"/api/projects/{project_id}")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["data"]["project"]["workspace_profile"], profile_key)

        in_use_delete = self.client.delete(f"/api/workspace-profiles/{created_profile['id']}")
        self.assertEqual(in_use_delete.status_code, 400)

        project_delete = self.client.delete(f"/api/projects/{project_id}")
        self.assertEqual(project_delete.status_code, 200)

        final_delete = self.client.delete(f"/api/workspace-profiles/{created_profile['id']}")
        self.assertEqual(final_delete.status_code, 200)

    def test_storage_policy_and_binding(self) -> None:
        policy_response = self.client.get("/api/storage-policy")
        self.assertEqual(policy_response.status_code, 200)
        policy_data = policy_response.json()["data"]
        self.assertIn("policy", policy_data)
        self.assertIn("data_provider", policy_data)
        self.assertIn("asset_provider", policy_data)
        self.assertIn("video_provider", policy_data)
        self.assertIn("fallback_provider", policy_data)

        apply_response = self.client.post("/api/storage-policy/apply")
        self.assertEqual(apply_response.status_code, 200)

        project_id = self.create_project()
        detail_response = self.client.get(f"/api/projects/{project_id}")
        self.assertEqual(detail_response.status_code, 200)
        detail = detail_response.json()["data"]
        self.assertIn("storage_binding", detail)
        self.assertIn("storage_provider", detail)

    def test_storage_policy_routes_documents_assets_and_video_by_provider_type(self) -> None:
        workspace_profile = f"routing-{uuid.uuid4().hex[:8]}"
        supabase_id = self.create_storage_provider(workspace_profile, "Workspace Supabase", "supabase-storage")
        google_id = self.create_storage_provider(workspace_profile, "Workspace Drive", "google-drive")

        apply_response = self.client.post(
            "/api/storage-policy/apply",
            headers={"X-Workspace-Profile": workspace_profile},
        )
        self.assertEqual(apply_response.status_code, 200)

        policy_response = self.client.get("/api/storage-policy", headers={"X-Workspace-Profile": workspace_profile})
        self.assertEqual(policy_response.status_code, 200)
        policy_data = policy_response.json()["data"]
        self.assertEqual(policy_data["data_provider"]["id"], supabase_id)
        self.assertEqual(policy_data["asset_provider"]["id"], google_id)
        self.assertEqual(policy_data["video_provider"]["id"], google_id)
        self.assertEqual(policy_data["policy"]["asset_provider_id"], google_id)

    def test_text_generation_flow(self) -> None:
        project_id = self.create_project()
        response = self.client.post(f"/api/projects/{project_id}/text-generate", json=self.build_text_payload())
        self.assertEqual(response.status_code, 200)

        data = response.json()["data"]
        self.assertEqual(data["project_id"], project_id)
        self.assertEqual(data["task_input"]["language"], "zh-TW")
        self.assertEqual(data["storyboard"]["style"], "comic")
        self.assertEqual(len(data["storyboard"]["scenes"]), 5)
        self.assertEqual(sum(scene["duration_seconds"] for scene in data["storyboard"]["scenes"]), 30)
        self.assertTrue(data["storyboard"]["scenes"][0]["goal"])
        self.assertTrue(data["email_payload"]["subject"].startswith("[資安演練通知]"))
        self.assertEqual(len(data["quiz"]["items"]), 10)
        self.assertTrue(data["cost_summary"]["within_budget"])

    def test_video_prepare_render_and_merge_flow(self) -> None:
        project_id = self.create_project()
        text_response = self.client.post(f"/api/projects/{project_id}/text-generate", json=self.build_text_payload())
        storyboard = text_response.json()["data"]["storyboard"]

        prepare_response = self.client.post(
            f"/api/projects/{project_id}/video-prepare",
            json={
                "storyboard_text": json.dumps(storyboard, ensure_ascii=False),
                "avatar_asset_id": None,
                "voice_asset_id": None,
                "style_asset_id": None,
                "duration": 8,
                "resolution": "1280x720",
                "subtitle_enabled": True,
                "subtitle_language": "繁體中文",
                "subtitle_font_family": "Noto Sans TC",
                "subtitle_position": "bottom",
                "subtitle_color": "#FFFFFF",
                "subtitle_size": 28,
                "speed": 1.0,
                "execute_all": True,
                "selected_scene_ids": [],
                "apply_scene1_to_all": False,
            },
        )
        self.assertEqual(prepare_response.status_code, 200)
        composition = prepare_response.json()["data"]["composition"]
        self.assertIn("global_settings", composition)
        self.assertEqual(composition["global_settings"]["aspect_ratio"], "16:9")
        render_request = prepare_response.json()["data"]["render_request"]

        render_response = self.client.post(
            f"/api/projects/{project_id}/video-render",
            json={"provider_id": None, "render_request": render_request},
        )
        self.assertEqual(render_response.status_code, 200)
        render_data = render_response.json()["data"]
        self.assertGreater(render_data["summary"]["scene_count"], 0)

        merge_response = self.client.post(f"/api/projects/{project_id}/merge", json={"scene_ids": []})
        self.assertEqual(merge_response.status_code, 200)
        merge_data = merge_response.json()["data"]
        self.assertIn("final_video_path", merge_data)
        self.assertIn("final_srt_path", merge_data)

    def test_video_single_scene_repair_flow(self) -> None:
        project_id = self.create_project()
        text_response = self.client.post(f"/api/projects/{project_id}/text-generate", json=self.build_text_payload())
        storyboard = text_response.json()["data"]["storyboard"]

        prepare_response = self.client.post(
            f"/api/projects/{project_id}/video-prepare",
            json={
                "storyboard_text": json.dumps(storyboard, ensure_ascii=False),
                "composition_json_text": "",
                "avatar_asset_id": None,
                "voice_asset_id": None,
                "style_asset_id": None,
                "duration": 8,
                "resolution": "1280x720",
                "aspect_ratio": "16:9",
                "subtitle_enabled": True,
                "subtitle_language": "????",
                "subtitle_font_family": "Noto Sans TC",
                "subtitle_position": "bottom",
                "subtitle_color": "#FFFFFF",
                "subtitle_size": 28,
                "speed": 1.0,
                "execute_all": True,
                "selected_scene_ids": [],
                "apply_scene1_to_all": False,
            },
        )
        self.assertEqual(prepare_response.status_code, 200)
        composition = prepare_response.json()["data"]["composition"]
        first_scene_id = composition["scenes"][0]["scene_id"]

        repair_response = self.client.post(
            f"/api/projects/{project_id}/video-repair-scene",
            json={
                "scene_id": first_scene_id,
                "reason": "??????",
                "provider_id": None,
                "composition_json_text": json.dumps(composition, ensure_ascii=False),
            },
        )
        self.assertEqual(repair_response.status_code, 200)
        repair_data = repair_response.json()["data"]
        self.assertEqual(repair_data["scene_id"], first_scene_id)
        self.assertEqual(repair_data["patch_request"]["mode"], "single_scene_repair")
        self.assertEqual(repair_data["patch_request"]["status"], "completed")
        repaired_scene = next(scene for scene in repair_data["composition"]["scenes"] if scene["scene_id"] == first_scene_id)
        self.assertGreaterEqual(repaired_scene["repair_state"]["revision"], 1)

    def test_workspace_profile_scopes_provider_visibility_and_default_resolution(self) -> None:
        alice_profile = self.create_workspace_profile(f"alice-{uuid.uuid4().hex[:8]}")["profile_key"]
        bob_profile = self.create_workspace_profile(f"bob-{uuid.uuid4().hex[:8]}")["profile_key"]
        alice_provider_id = self.create_provider(alice_profile, f"Alice Provider {uuid.uuid4()}")
        bob_provider_id = self.create_provider(bob_profile, f"Bob Provider {uuid.uuid4()}")

        alice_list = self.client.get("/api/providers", headers={"X-Workspace-Profile": alice_profile})
        self.assertEqual(alice_list.status_code, 200)
        alice_ids = {item["id"] for item in alice_list.json()["data"]}
        self.assertIn(alice_provider_id, alice_ids)
        self.assertNotIn(bob_provider_id, alice_ids)

        bob_list = self.client.get("/api/providers", headers={"X-Workspace-Profile": bob_profile})
        self.assertEqual(bob_list.status_code, 200)
        bob_ids = {item["id"] for item in bob_list.json()["data"]}
        self.assertIn(bob_provider_id, bob_ids)
        self.assertNotIn(alice_provider_id, bob_ids)

        project_id = self.create_project(alice_profile)
        payload = self.build_text_payload()
        payload["generate_mail"] = False
        payload["generate_quiz"] = False
        generate_response = self.client.post(
            f"/api/projects/{project_id}/text-generate",
            json=payload,
        )
        self.assertEqual(generate_response.status_code, 200)

        logs_response = self.client.get(f"/api/projects/{project_id}/provider-logs")
        self.assertEqual(logs_response.status_code, 200)
        logs = logs_response.json()["data"]
        self.assertTrue(logs)
        text_generate_log = next((item for item in logs if item["action"] == "text.generate"), None)
        self.assertIsNotNone(text_generate_log)
        self.assertEqual(text_generate_log["provider_id"], alice_provider_id)

    def test_provider_connection_test_endpoints(self) -> None:
        def build_response(status_code: int, payload: dict | None = None, text: str = "ok") -> Mock:
            mocked = Mock()
            mocked.ok = 200 <= status_code < 300
            mocked.status_code = status_code
            mocked.text = text
            if payload is None:
                mocked.json.side_effect = ValueError("no json")
            else:
                mocked.json.return_value = payload
            return mocked

        text_response = build_response(200, {"id": "gpt-4.1-mini"})
        with patch("backend.app.services.provider_service.requests.request", return_value=text_response) as mocked_request:
            text_test = self.client.post(
                "/api/providers/test",
                headers={"X-Workspace-Profile": "alice"},
                json={
                    "provider_type": "text_llm",
                    "name": "Alice OpenAI",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-test",
                    "model": "gpt-4.1-mini",
                    "region": "global",
                    "create_job_path": "",
                    "get_job_path": "",
                    "status": "active",
                    "is_default": False,
                    "config_json": {},
                },
            )
        self.assertEqual(text_test.status_code, 200)
        self.assertTrue(text_test.json()["data"]["ok"])
        args, kwargs = mocked_request.call_args
        self.assertEqual(args[0], "GET")
        self.assertEqual(args[1], "https://api.openai.com/v1/models/gpt-4.1-mini")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer sk-test")

        sora_response = build_response(200, {"id": "sora-2"})
        with patch("backend.app.services.provider_service.requests.request", return_value=sora_response) as mocked_request:
            sora_test = self.client.post(
                "/api/providers/test",
                headers={"X-Workspace-Profile": "alice"},
                json={
                    "provider_type": "video_llm",
                    "name": "OpenAI Sora",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-video",
                    "model": "sora-2",
                    "region": "global",
                    "create_job_path": "",
                    "get_job_path": "",
                    "status": "active",
                    "is_default": False,
                    "config_json": {"video_vendor": "openai_sora"},
                },
            )
        self.assertEqual(sora_test.status_code, 200)
        self.assertTrue(sora_test.json()["data"]["ok"])
        args, kwargs = mocked_request.call_args
        self.assertEqual(args[0], "GET")
        self.assertEqual(args[1], "https://api.openai.com/v1/models/sora-2")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer sk-video")

        veo_response = build_response(200, {"name": "models/veo-3.1-generate-preview"})
        with patch("backend.app.services.provider_service.requests.request", return_value=veo_response) as mocked_request:
            veo_test = self.client.post(
                "/api/providers/test",
                headers={"X-Workspace-Profile": "alice"},
                json={
                    "provider_type": "video_llm",
                    "name": "Google Veo",
                    "base_url": "https://generativelanguage.googleapis.com/v1beta",
                    "api_key": "google-key",
                    "model": "veo-3.1-generate-preview",
                    "region": "global",
                    "create_job_path": "",
                    "get_job_path": "",
                    "status": "active",
                    "is_default": False,
                    "config_json": {"video_vendor": "google_veo"},
                },
            )
        self.assertEqual(veo_test.status_code, 200)
        self.assertTrue(veo_test.json()["data"]["ok"])
        args, kwargs = mocked_request.call_args
        self.assertEqual(args[0], "GET")
        self.assertEqual(args[1], "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview")
        self.assertEqual(kwargs["headers"]["x-goog-api-key"], "google-key")

        runway_response = build_response(200, {"id": "org_test"})
        with patch("backend.app.services.provider_service.requests.request", return_value=runway_response) as mocked_request:
            runway_test = self.client.post(
                "/api/providers/test",
                headers={"X-Workspace-Profile": "alice"},
                json={
                    "provider_type": "video_llm",
                    "name": "Runway",
                    "base_url": "https://api.dev.runwayml.com/v1",
                    "api_key": "runway-key",
                    "model": "gen4_turbo",
                    "region": "global",
                    "create_job_path": "",
                    "get_job_path": "",
                    "status": "active",
                    "is_default": False,
                    "config_json": {"video_vendor": "runway"},
                },
            )
        self.assertEqual(runway_test.status_code, 200)
        self.assertTrue(runway_test.json()["data"]["ok"])
        args, kwargs = mocked_request.call_args
        self.assertEqual(args[0], "GET")
        self.assertEqual(args[1], "https://api.dev.runwayml.com/v1/organization")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer runway-key")
        self.assertEqual(kwargs["headers"]["X-Runway-Version"], "2024-11-06")

        seedance_response = build_response(422, {"error": {"message": "missing prompt"}})
        with patch("backend.app.services.provider_service.requests.request", return_value=seedance_response) as mocked_request:
            seedance_test = self.client.post(
                "/api/providers/test",
                headers={"X-Workspace-Profile": "alice"},
                json={
                    "provider_type": "video_llm",
                    "name": "SeedDance",
                    "base_url": "https://operator.las.cn-beijing.volces.com",
                    "api_key": "seedance-key",
                    "model": "doubao-seedance-1-5-pro-251215",
                    "region": "global",
                    "create_job_path": "",
                    "get_job_path": "",
                    "status": "active",
                    "is_default": False,
                    "config_json": {"video_vendor": "seedance"},
                },
            )
        self.assertEqual(seedance_test.status_code, 200)
        self.assertTrue(seedance_test.json()["data"]["ok"])
        args, kwargs = mocked_request.call_args
        self.assertEqual(args[0], "POST")
        self.assertEqual(args[1], "https://operator.las.cn-beijing.volces.com/api/v1/contents/generations/tasks")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer seedance-key")
        self.assertEqual(kwargs["json"], {})

        seedance_auth_failure = build_response(401, {"error": {"message": "unauthorized"}})
        with patch("backend.app.services.provider_service.requests.request", return_value=seedance_auth_failure):
            seedance_failed_test = self.client.post(
                "/api/providers/test",
                headers={"X-Workspace-Profile": "alice"},
                json={
                    "provider_type": "video_llm",
                    "name": "SeedDance",
                    "base_url": "https://operator.las.cn-beijing.volces.com",
                    "api_key": "bad-key",
                    "model": "doubao-seedance-1-5-pro-251215",
                    "region": "global",
                    "create_job_path": "",
                    "get_job_path": "",
                    "status": "active",
                    "is_default": False,
                    "config_json": {"video_vendor": "seedance"},
                },
            )
        self.assertEqual(seedance_failed_test.status_code, 200)
        self.assertFalse(seedance_failed_test.json()["data"]["ok"])

        providers_response = self.client.get("/api/providers")
        self.assertEqual(providers_response.status_code, 200)
        storage_provider = next((item for item in providers_response.json()["data"] if item["provider_type"] == "storage"), None)
        self.assertIsNotNone(storage_provider)

        storage_test = self.client.post(f"/api/providers/{storage_provider['id']}/test")
        self.assertEqual(storage_test.status_code, 200)
        self.assertTrue(storage_test.json()["data"]["ok"])

    def test_delete_active_workspace_storage_reapplies_policy(self) -> None:
        workspace_profile = f"storage-{uuid.uuid4().hex[:8]}"
        primary_storage_id = self.create_storage_provider(workspace_profile, "Workspace Supabase", "supabase-storage")
        secondary_storage_id = self.create_storage_provider(workspace_profile, "Workspace Drive", "google-drive")

        select_response = self.client.post(
            "/api/storage-policy/select-provider",
            headers={"X-Workspace-Profile": workspace_profile},
            json={"provider_id": primary_storage_id},
        )
        self.assertEqual(select_response.status_code, 200)
        self.assertEqual(select_response.json()["data"]["data_provider"]["id"], primary_storage_id)
        self.assertNotEqual(select_response.json()["data"]["asset_provider"]["id"], primary_storage_id)

        delete_response = self.client.delete(
            f"/api/providers/{primary_storage_id}",
            headers={"X-Workspace-Profile": workspace_profile},
        )
        self.assertEqual(delete_response.status_code, 200)

        policy_response = self.client.get("/api/storage-policy", headers={"X-Workspace-Profile": workspace_profile})
        self.assertEqual(policy_response.status_code, 200)
        policy_data = policy_response.json()["data"]
        self.assertNotEqual(policy_data["data_provider"]["id"], primary_storage_id)
        self.assertEqual(policy_data["asset_provider"]["id"], secondary_storage_id)
        self.assertEqual(policy_data["video_provider"]["id"], secondary_storage_id)
        self.assertEqual(policy_data["data_provider"]["id"], policy_data["fallback_provider"]["id"])


if __name__ == "__main__":
    unittest.main()
