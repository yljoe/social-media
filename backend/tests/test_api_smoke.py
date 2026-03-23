import unittest

from backend.tests import test_support  # noqa: F401
from fastapi.testclient import TestClient

from backend.app.db import init_db
from backend.app.main import app


class ApiSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        init_db()
        cls.client = TestClient(app)

    def test_health(self) -> None:
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

    def test_projects(self) -> None:
        response = self.client.get("/api/projects")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

    def test_providers(self) -> None:
        response = self.client.get("/api/providers")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

    def test_assets(self) -> None:
        response = self.client.get("/api/assets")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

    def test_costs(self) -> None:
        response = self.client.get("/api/costs")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])


if __name__ == "__main__":
    unittest.main()
