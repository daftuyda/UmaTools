import json
import runpy
import shutil
import sqlite3
import subprocess
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class BundledApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        temporary = tempfile.TemporaryDirectory()
        cls.addClassCleanup(temporary.cleanup)
        cls.bundle = Path(temporary.name).resolve()
        cls.assets = cls.bundle / "runtime-assets"
        subprocess.run(
            [
                "node",
                "-e",
                "require('./scripts/build/prepare-api-assets.js').prepareApiAssets("
                "{outputDir: process.argv[1]})",
                str(cls.assets),
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        api = cls.bundle / "api" / "[...path].py"
        api.parent.mkdir()
        shutil.copy2(PROJECT_ROOT / "api" / api.name, api)
        cls.namespace = runpy.run_path(str(api))
        cls.client = cls.enterClassContext(TestClient(cls.namespace["app"]))

    def test_runtime_assets_work_without_public_directory(self):
        self.assertFalse((self.bundle / "public").exists())
        self.assertEqual(self.namespace["ASSETS"], self.assets)
        self.assertTrue((self.assets / "fonts" / "OFL.txt").is_file())

    def test_all_og_pages_and_route_aliases(self):
        for page in self.namespace["OG_PAGES"]:
            image_bytes = None
            for target in (
                f"/api/og?page={page}",
                f"/api/og/{page}.png",
                f"/api/og/v1/{page}.png",
            ):
                with self.subTest(target=target):
                    response = self.client.get(target)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers["content-type"], "image/png")
                    self.assertIn("s-maxage=604800", response.headers["cache-control"])
                    self.assertGreater(len(response.content), 10 * 1024)
                    with Image.open(BytesIO(response.content)) as image:
                        self.assertEqual(image.format, "PNG")
                        self.assertEqual(image.size, (1200, 630))
                        image.verify()
                    if image_bytes is None:
                        image_bytes = response.content
                    self.assertEqual(response.content, image_bytes)
                    head = self.client.head(target)
                    self.assertEqual(head.status_code, 200)
                    self.assertEqual(head.headers["content-type"], "image/png")
                    self.assertEqual(int(head.headers["content-length"]), len(image_bytes))
                    self.assertEqual(head.content, b"")

    def test_unknown_og_page_is_not_a_server_error(self):
        for target in (
            "/api/og?page=unknown-page",
            "/api/og/unknown-page.png",
            "/api/og/v1/unknown-page.png",
        ):
            for method in (self.client.get, self.client.head):
                with self.subTest(target=target, method=method.__name__):
                    self.assertEqual(method(target).status_code, 404)

    def test_event_search_bounds(self):
        for params in (
            {"event_name": ""},
            {"event_name": " "},
            {"event_name": "a" * 201},
            {"event_name": "test", "limit": -1},
            {"event_name": "test", "limit": 0},
            {"event_name": "test", "limit": 21},
        ):
            self.assertEqual(self.client.get("/api/event_by_name", params=params).status_code, 422)

    def test_compact_master_catalog(self):
        response = self.client.get("/api/data/v1/global/catalog")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["server"], "global")
        self.assertEqual(len(data["skills"]), data["skill_count"])
        self.assertEqual(set(data["skills"][0]), {"id", "name", "grade_value", "need_skill_point"})

    def test_event_data_is_available_in_the_bundle(self):
        response = self.client.get("/api/events")
        self.assertEqual(response.status_code, 200)
        events = response.json()["events"]
        self.assertGreater(len(events), 0)
        match = self.client.get("/api/event_by_name", params={"event_name": events[0]})
        self.assertEqual(match.status_code, 200)
        self.assertEqual(match.json()["match"]["event_name"], events[0])
        self.assertEqual(match.json()["match"]["score"], 100)

    def test_master_data_is_available_without_public_directory(self):
        for server in ("global", "jp"):
            with self.subTest(server=server):
                status = self.client.get(f"/api/data/v1/{server}/status")
                self.assertEqual(status.status_code, 200)
                self.assertEqual(status.json()["server"], server)
                self.assertIn(status.json()["source"]["kind"], ("game-master", "cdn-master"))
                self.assertEqual(len(status.json()["source"]["sha256"]), 64)
                self.assertNotIn("skills", status.json())
                response = self.client.get(f"/api/data/v1/{server}/skills/201432")
                self.assertEqual(response.status_code, 200)
                skill = response.json()["skill"]
                self.assertEqual(skill["grade_value"], 85)
                self.assertEqual(skill["need_skill_point"], 120)
                self.assertEqual(skill["condition_1"], "running_style==3&phase_random==1")
                self.assertEqual(
                    skill["name"], "Studious" if server == "global" else "\u8aad\u89e3\u529b"
                )

    def test_master_search_pagination_and_validation(self):
        base = "/api/data/v1/global/skills"
        found = self.client.get(base, params={"q": "sTuDiOuS"}).json()
        self.assertEqual(found["total"], 1)
        self.assertEqual(found["skills"][0]["id"], 201432)
        by_id = self.client.get(base, params={"q": "201432"}).json()
        self.assertEqual(by_id["skills"], found["skills"])
        first = self.client.get(base, params={"limit": 2}).json()
        second = self.client.get(base, params={"limit": 1, "offset": 1}).json()
        self.assertEqual(first["skills"][1], second["skills"][0])
        self.assertEqual(first["total"], first["skill_count"])
        for params in ({"limit": 0}, {"limit": 1001}, {"offset": -1}):
            self.assertEqual(self.client.get(base, params=params).status_code, 422)
        self.assertEqual(self.client.get(base + "/-1").status_code, 404)
        self.assertEqual(self.client.get("/api/data/v1/unknown/skills").status_code, 422)

    def test_missing_server_snapshot_does_not_fall_back(self):
        snapshot = self.assets / "master" / "jp.json"
        hidden = snapshot.with_suffix(".unavailable")
        snapshot.rename(hidden)
        try:
            self.assertEqual(self.client.get("/api/data/v1/jp/status").status_code, 503)
            self.assertEqual(self.client.get("/api/data/v1/global/status").status_code, 200)
        finally:
            hidden.rename(snapshot)


class MasterImportTests(unittest.TestCase):
    def test_import_preserves_raw_values_and_is_repeatable(self):
        importer = runpy.run_path(str(PROJECT_ROOT / "scripts/data/import-master.py"))
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            master = root / "Game_Data/Persistent/master/master.mdb"
            master.parent.mkdir(parents=True)
            database = sqlite3.connect(master)
            try:
                database.executescript("""
                    CREATE TABLE skill_data (id INTEGER PRIMARY KEY, grade_value INTEGER, rarity INTEGER);
                    INSERT INTO skill_data VALUES (201432, 85, 1), (2, -174, 1);
                    CREATE TABLE text_data (category INTEGER, "index" INTEGER, text TEXT);
                    INSERT INTO text_data VALUES (47, 201432, 'Studious'), (48, 201432, 'Description'), (47, 2, 'Penalty');
                    CREATE TABLE single_mode_skill_need_point (id INTEGER, need_skill_point INTEGER);
                    INSERT INTO single_mode_skill_need_point VALUES (201432, 120);
                """)
            finally:
                database.close()
            original = master.read_bytes()
            export = importer["export_master"]
            output, count, changed = export(root, "global", root / "out")
            self.assertEqual(count, 2)
            self.assertTrue(changed)
            saved = output.read_bytes()
            data = json.loads(saved)
            self.assertEqual(data["skills"][0]["grade_value"], -174)
            self.assertIsNone(data["skills"][0]["need_skill_point"])
            self.assertEqual(data["skills"][1]["grade_value"], 85)
            self.assertEqual(data["skills"][1]["description"], "Description")
            self.assertIsNone(data["source"]["game_version"])
            self.assertNotIn(str(root), saved.decode())
            self.assertFalse(export(master, "global", root / "out")[2])
            self.assertEqual(output.read_bytes(), saved)
            self.assertEqual(master.read_bytes(), original)
            invalid = root / "invalid.mdb"
            invalid.write_bytes(b"not a database")
            with self.assertRaises(sqlite3.DatabaseError):
                export(invalid, "global", root / "out")
            self.assertEqual(output.read_bytes(), saved)


if __name__ == "__main__":
    unittest.main()
