#!/usr/bin/env python3
"""Refresh verifiable extraction inputs from participant-visible native artifacts."""
from __future__ import annotations

import csv
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIVE_SUFFIXES = {".png", ".jpg", ".jpeg", ".pdf"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def prepare(root: Path = ROOT) -> dict:
    dataset = root / "dataset"
    artifacts = {}
    versions = {}
    for name, args in (("tesseract", ["--version"]), ("pdftotext", ["-v"])):
        if not shutil.which(name):
            raise RuntimeError(f"Install {name} before refreshing deployment extraction inputs.")
        result = subprocess.run([name, *args], capture_output=True, text=True, check=True)
        versions[name] = (result.stdout or result.stderr).splitlines()[0]
    with (dataset / "evidence_files.csv").open(encoding="utf-8", newline="") as handle:
        for item in csv.DictReader(handle):
            source = (dataset / item["file_path"]).resolve()
            if dataset.resolve() not in source.parents:
                raise ValueError("Evidence path escapes the dataset")
            if source.suffix.casefold() not in NATIVE_SUFFIXES:
                continue
            command = ["pdftotext", "-layout", str(source), "-"] if source.suffix.casefold() == ".pdf" else ["tesseract", str(source), "stdout"]
            text = subprocess.run(command, check=True, capture_output=True, text=True).stdout
            if not text.strip():
                raise ValueError(f"Empty extraction for {item['file_id']}")
            artifacts[item["file_id"]] = {"sourceSha256": digest(source.read_bytes()),
                                         "textSha256": digest(text.encode("utf-8")), "text": text}
    payload = {"schemaVersion": 1, "extractors": versions, "artifacts": artifacts}
    output = root / "deployment" / "evidence-text.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return {"artifacts": len(artifacts), "extractors": versions}


if __name__ == "__main__":
    print(json.dumps(prepare(), indent=2))
