#!/usr/bin/env python3
"""Smoke-test the built static site with the reviewed Vercel rewrites and headers."""
from __future__ import annotations

import argparse
import json
import mimetypes
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from ghosttrace.deployment_config import REWRITES
from ghosttrace.http_security import SECURITY_HEADERS

ROOT = Path(__file__).resolve().parent.parent


def resolve_route(path: str) -> str:
    for route in REWRITES:
        source = route["source"]
        names = re.findall(r":([A-Za-z]+)", source)
        pattern = re.escape(source)
        for name in names:
            pattern = pattern.replace(re.escape(":" + name), f"(?P<{name}>[^/]+)")
        match = re.fullmatch(pattern, path)
        if match:
            destination = route["destination"]
            for name, value in match.groupdict().items():
                destination = destination.replace(":" + name, value)
            return destination
    return "/index.html" if path == "/" else path


def handler_for(directory: Path):
    directory = directory.resolve()
    manifest = json.loads((directory / ".ghosttrace-build.json").read_text())
    files = set(manifest["files"])

    class Handler(BaseHTTPRequestHandler):
        server_version = "GhostTracePreview/1.0"

        def log_message(self, *_args):
            return

        def do_HEAD(self):  # noqa: N802
            self.do_GET()

        def do_GET(self):  # noqa: N802
            path = unquote(urlparse(self.path).path)
            relative = resolve_route(path).lstrip("/")
            target = (directory / relative).resolve()
            status = 200
            if relative not in files or directory not in target.parents or not target.is_file():
                status, target = 404, directory / "404.html"
            body = target.read_bytes()
            mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store" if path.startswith("/api/") else "public, max-age=0, must-revalidate")
            if status == 200 and path == "/api/export.csv":
                self.send_header("Content-Disposition", 'attachment; filename="output.csv"')
            elif status == 200 and path.startswith("/api/evidence/"):
                self.send_header("Content-Disposition", "attachment")
            for key, value in SECURITY_HEADERS.items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

    return Handler


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8789)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(ROOT / "dist"))
    print(f"GhostTrace production snapshot preview: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
