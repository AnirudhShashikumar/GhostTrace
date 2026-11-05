"""Regression gates for real-data deployment builds and the published route surface."""
from __future__ import annotations

import csv
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_site import build, verified_extractions
from ghosttrace.deployment_config import vercel_config
from ghosttrace.evidence import EvidenceIndex
from preview_site import handler_for, resolve_route

ROOT = Path(__file__).resolve().parents[2]


class DeploymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temporary.name)
        shutil.copytree(ROOT / "dataset", cls.root / "dataset")
        shutil.copytree(ROOT / "deployment", cls.root / "deployment")
        shutil.copytree(ROOT / "code" / "ui", cls.root / "code" / "ui")
        shutil.copyfile(ROOT / "vercel.json", cls.root / "vercel.json")
        cls.result = build(cls.root)
        cls.handler = handler_for(cls.root / "dist")

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def get(self, path, method="GET"):
        handler = object.__new__(self.handler)
        handler.path, handler.command = path, method
        handler.wfile = io.BytesIO()
        headers, statuses = {}, []
        handler.send_response = statuses.append
        handler.send_header = headers.__setitem__
        handler.end_headers = lambda: None
        handler.do_GET()
        return statuses[0], headers, handler.wfile.getvalue()

    def test_build_preserves_all_requests_and_actual_decisions(self):
        self.assertEqual(self.result["cases"], 518)
        status, headers, body = self.get("/api/export.csv")
        self.assertEqual(status, 200)
        rows = list(csv.DictReader(io.StringIO(body.decode())))
        self.assertEqual(len(rows), 518)
        for row in rows:
            _, _, detail = self.get(f"/api/cases/{row['case_id']}")
            decision = json.loads(detail)["decision"]
            self.assertEqual(row["deletion_status"], decision["status"])
            self.assertEqual(json.loads(row["steps_json"]), decision["steps"])
        self.assertIn("attachment", headers["Content-Disposition"])

    def test_repeated_build_is_byte_reproducible(self):
        before = (self.root / "dist" / ".ghosttrace-build.json").read_bytes()
        build(self.root)
        self.assertEqual(before, (self.root / "dist" / ".ghosttrace-build.json").read_bytes())

    def test_attested_extractions_reject_modified_source(self):
        source = self.root / "deployment" / "evidence-text.json"
        payload = json.loads(source.read_text())
        payload["artifacts"]["evidence_04"]["sourceSha256"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            alternate = Path(directory) / "evidence-text.json"
            alternate.write_text(json.dumps(payload))
            with self.assertRaisesRegex(ValueError, "Unverified extraction"):
                verified_extractions(self.root / "dataset", alternate, Path(directory))

    def test_attested_extractions_reject_modified_text(self):
        payload = json.loads((self.root / "deployment" / "evidence-text.json").read_text())
        payload["artifacts"]["evidence_04"]["text"] += "unexpected change"
        with tempfile.TemporaryDirectory() as directory:
            alternate = Path(directory) / "evidence-text.json"
            alternate.write_text(json.dumps(payload))
            with self.assertRaisesRegex(ValueError, "Unverified extraction"):
                verified_extractions(self.root / "dataset", alternate, Path(directory))

    def test_production_routes_headers_and_unknown_paths(self):
        for path in ("/", "/app.js", "/theme.js", "/api/summary", "/api/health", "/api/cases", "/api/cases/case_33", "/api/evidence/evidence_18"):
            status, headers, body = self.get(path)
            self.assertEqual(status, 200, path)
            self.assertTrue(body)
            self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
            self.assertIn("script-src 'self'", headers["Content-Security-Policy"])
        for path in ("/api/cases/case_999999", "/api/evidence/evidence_999999", "/.env", "/log.txt", "/README.md", "/%2e%2e/AGENTS.md", "/unknown-route"):
            status, _, body = self.get(path)
            self.assertEqual(status, 404, path)
            self.assertNotIn(b"SESSION START", body)
        status, headers, body = self.get("/api/summary", method="HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertGreater(int(headers["Content-Length"]), 0)

    def test_output_contains_only_allowlisted_site_content(self):
        names = {p.relative_to(self.root / "dist").as_posix() for p in (self.root / "dist").rglob("*") if p.is_file()}
        self.assertFalse(any(name.startswith(("dataset/", "code/", ".env", "log.txt", "node_modules/")) for name in names))
        self.assertEqual(len([name for name in names if name.startswith("data/evidence/")]), 94)
        self.assertEqual(json.loads((ROOT / "vercel.json").read_text()), vercel_config())
        self.assertEqual(resolve_route("/api/cases/case_33"), "/data/cases/case_33.json")

    def test_unowned_output_is_not_deleted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / "dist").mkdir()
            (root / "dist" / "keep.txt").write_text("user content")
            with self.assertRaisesRegex(ValueError, "unowned"):
                build(root)
            self.assertEqual((root / "dist" / "keep.txt").read_text(), "user content")


class ExtractionCacheTests(unittest.TestCase):
    def test_replacing_an_artifact_invalidates_its_previous_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "evidence.png"
            source.write_bytes(b"first source")
            index = object.__new__(EvidenceIndex)
            index.cache_dir = root / "cache"
            index.extraction_warnings = []
            evidence = SimpleNamespace(file_id="evidence_test")
            with patch("ghosttrace.evidence.shutil.which", return_value="/tool"), patch("ghosttrace.evidence.subprocess.run") as run:
                run.return_value = SimpleNamespace(stdout="first extracted text")
                self.assertEqual(index._text_for(source, evidence), "first extracted text")
                self.assertEqual(index._text_for(source, evidence), "first extracted text")
                self.assertEqual(run.call_count, 1)
                source.write_bytes(b"replacement source")
                run.return_value = SimpleNamespace(stdout="replacement extracted text")
                self.assertEqual(index._text_for(source, evidence), "replacement extracted text")
                self.assertEqual(run.call_count, 2)
