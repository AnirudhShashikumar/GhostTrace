from __future__ import annotations

import json
import mimetypes
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

from .engine import GhostTraceEngine
from .http_security import SECURITY_HEADERS
from .workstation import Workstation

UI_DIR = Path(__file__).resolve().parents[1] / "ui"
UI_ASSETS = {"index.html", "app.js", "theme.js", "styles.css", "halloween.css", "404.html", "error.css"}


def serve(engine: GhostTraceEngine, host: str = "127.0.0.1", port: int = 8787) -> None:
    workstation = Workstation(engine)

    class Handler(BaseHTTPRequestHandler):
        server_version = "GhostTrace/1.0"

        def log_message(self, fmt: str, *args) -> None:
            # Never write case identifiers, queries or participant data to access logs.
            return

        def do_HEAD(self) -> None:  # noqa: N802
            self.do_GET()

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path == "/api/health":
                self._json({"status": "ok", **engine.diagnostics()})
                return
            if parsed.path == "/api/summary":
                self._json(workstation.summary())
                return
            if parsed.path == "/api/cases":
                query = parse_qs(parsed.query)
                self._json(workstation.cases(query.get("q", [""])[0], query.get("status", [""])[0]))
                return
            match = re.fullmatch(r"/api/cases/(case_\d+)", parsed.path)
            if match:
                payload = workstation.case_detail(match.group(1))
                self._json(payload if payload is not None else {"error": "Case not found"},
                           HTTPStatus.OK if payload is not None else HTTPStatus.NOT_FOUND)
                return
            if parsed.path == "/api/export.csv":
                self._download(workstation.export_csv(), "text/csv; charset=utf-8", "output.csv")
                return
            match = re.fullmatch(r"/api/evidence/(evidence_\d+)", parsed.path)
            if match:
                evidence = workstation.files.get(match.group(1))
                if evidence is None:
                    self._json({"error": "Evidence not found"}, HTTPStatus.NOT_FOUND)
                    return
                target = (engine.dataset_dir / evidence.path).resolve()
                if engine.dataset_dir not in target.parents or not target.is_file():
                    self._json({"error": "Evidence unavailable"}, HTTPStatus.NOT_FOUND)
                    return
                self._download(target.read_bytes(), mimetypes.guess_type(target.name)[0] or "application/octet-stream", target.name)
                return
            if parsed.path.startswith("/api/"):
                self._json({"error": "Endpoint not found"}, HTTPStatus.NOT_FOUND)
                return
            self._static(parsed.path)

        def _send(self, data: bytes, mime: str, status: HTTPStatus = HTTPStatus.OK,
                  filename: str = "") -> None:
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
            if filename:
                # RFC 5987 encoding prevents header injection and supports non-ASCII names.
                self.send_header("Content-Disposition", f'attachment; filename="{re.sub(r"[^A-Za-z0-9_.-]", "_", filename)}"; filename*=UTF-8\'\'{quote(filename, safe="")}')
            for key, value in SECURITY_HEADERS.items():
                self.send_header(key, value)
            self.end_headers()
            if getattr(self, "command", "GET") != "HEAD":
                self.wfile.write(data)

        def _download(self, data: bytes, mime: str, filename: str) -> None:
            self._send(data, mime, filename=filename)

        def _json(self, payload, status: HTTPStatus = HTTPStatus.OK) -> None:
            self._send(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8"),
                       "application/json; charset=utf-8", status)

        def _static(self, request_path: str) -> None:
            relative = "index.html" if request_path in {"", "/"} else unquote(request_path).lstrip("/")
            if relative not in UI_ASSETS:
                self._send((UI_DIR / "404.html").read_bytes(), "text/html; charset=utf-8", HTTPStatus.NOT_FOUND)
                return
            target = (UI_DIR / relative).resolve()
            if UI_DIR.resolve() not in target.parents or not target.is_file():
                self._json({"error": "Asset not found"}, HTTPStatus.NOT_FOUND)
                return
            mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self._send(target.read_bytes(), f"{mime}; charset=utf-8" if mime.startswith("text/") else mime)

    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"GhostTrace workstation: http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
