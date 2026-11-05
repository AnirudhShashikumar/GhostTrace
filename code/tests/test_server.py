"""Exercise the UI API handlers in process; no socket or browser is required."""
from __future__ import annotations

import csv
import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ghosttrace.engine import GhostTraceEngine
from ghosttrace.server import serve


class WorkstationAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = GhostTraceEngine(Path(__file__).resolve().parents[2] / "dataset")
        cls.decisions = {item.case_id: item for item in cls.engine.audit_all()}
        handlers = []

        class InProcessServer:
            def __init__(self, _address, handler):
                handlers.append(handler)

            def serve_forever(self):
                pass

            def server_close(self):
                pass

        with patch("ghosttrace.server.ThreadingHTTPServer", InProcessServer), redirect_stdout(io.StringIO()):
            serve(cls.engine)
        cls.handler = handlers[0]

    def get(self, path):
        handler = object.__new__(self.handler)
        handler.path = path
        handler.wfile = io.BytesIO()
        headers = {}
        status = []
        handler.send_response = status.append
        handler.send_header = headers.__setitem__
        handler.end_headers = lambda: None
        handler.do_GET()
        return status[0], headers, handler.wfile.getvalue()

    def test_snapshot_and_resource_counts_derive_from_existing_decisions(self):
        status, _, body = self.get("/api/summary")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["total"], 518)
        _, _, body = self.get("/api/cases")
        for case in json.loads(body):
            steps = self.decisions[case["caseId"]].steps
            self.assertEqual(case["resourceCount"], len({(step.system_id, step.resource_id) for step in steps}))

    def test_csv_download_preserves_every_engine_row(self):
        status, headers, body = self.get("/api/export.csv")
        self.assertEqual(status, 200)
        self.assertIn('attachment; filename="output.csv"', headers["Content-Disposition"])
        rows = list(csv.DictReader(io.StringIO(body.decode("utf-8"))))
        self.assertEqual(len(rows), 518)
        self.assertEqual(rows, [item.to_row() for item in self.decisions.values()])
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_policy_metadata_and_links_use_only_cutoff_eligible_observations(self):
        case = next(item for item in self.engine.cases if item.case_id == "case_34")
        status, _, body = self.get("/api/cases/case_34")
        payload = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(payload["decision"]["steps"], [step.to_dict() for step in self.decisions[case.case_id].steps])
        self.assertTrue(payload["observations"])
        for observation in payload["observations"]:
            self.assertLessEqual(observation["observedAt"], case.audit_at.isoformat())
            self.assertIn(observation["linkType"], {"direct identifier", "activity ownership"})
            self.assertIn("policyTarget", observation)

    def test_evidence_download_is_exact_manifest_source(self):
        evidence = next(item for item in self.engine.evidence.files if item.file_id == "evidence_18")
        status, headers, body = self.get("/api/evidence/evidence_18")
        self.assertEqual(status, 200)
        self.assertEqual(body, (self.engine.dataset_dir / evidence.path).read_bytes())
        self.assertEqual(headers["Content-Type"], "application/pdf")
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("attachment", headers["Content-Disposition"])

    def test_unknown_evidence_does_not_fall_back_to_a_different_file(self):
        status, _, body = self.get("/api/evidence/evidence_999999")
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body)["error"], "Evidence not found")

    def test_unknown_and_private_paths_return_404(self):
        for path in ("/api/unknown", "/api/cases/case_999999", "/.env", "/log.txt", "/REDESIGN.md", "/%2e%2e/AGENTS.md", "/missing.js"):
            status, headers, _ = self.get(path)
            self.assertEqual(status, 404, path)
            self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

    def test_styles_and_theme_bootstrap_are_served_under_the_existing_csp(self):
        for path, mime in (("/halloween.css", "text/css"), ("/theme.js", "text/javascript")):
            status, headers, body = self.get(path)
            self.assertEqual(status, 200)
            self.assertTrue(headers["Content-Type"].startswith(mime))
            self.assertTrue(body)
            self.assertIn("script-src 'self'", headers["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main()
