#!/usr/bin/env python3
"""Build a real participant-data snapshot without a serverless OCR dependency."""
from __future__ import annotations

import csv
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

from ghosttrace.deployment_config import vercel_config
from ghosttrace.engine import GhostTraceEngine
from ghosttrace.server import UI_ASSETS
from ghosttrace.validation import validate_output
from ghosttrace.workstation import Workstation
from prepare_deployment import NATIVE_SUFFIXES

ROOT = Path(__file__).resolve().parent.parent


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")


def verified_extractions(dataset: Path, source: Path, cache: Path) -> None:
    payload = json.loads(source.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != 1:
        raise ValueError("Unsupported extraction schema")
    artifacts = payload["artifacts"]
    expected = set()
    with (dataset / "evidence_files.csv").open(encoding="utf-8", newline="") as handle:
        for item in csv.DictReader(handle):
            target = (dataset / item["file_path"]).resolve()
            if dataset.resolve() not in target.parents:
                raise ValueError("Evidence path escapes dataset")
            if target.suffix.casefold() not in NATIVE_SUFFIXES:
                continue
            file_id = item["file_id"]
            expected.add(file_id)
            entry = artifacts.get(file_id, {})
            text = entry.get("text", "")
            if not text.strip() or digest(target.read_bytes()) != entry.get("sourceSha256") or digest(text.encode("utf-8")) != entry.get("textSha256"):
                raise ValueError(f"Unverified extraction for {file_id}; run code/prepare_deployment.py with native extractors")
            if not file_id.replace("_", "").isalnum():
                raise ValueError("Invalid evidence ID")
            (cache / f"{file_id}.txt").write_text(text, encoding="utf-8")
    if expected != set(artifacts):
        raise ValueError("Extraction artifact set does not match the participant manifest")


def build(root: Path = ROOT) -> dict:
    root = root.resolve()
    output = root / "dist"
    if output.is_symlink() or (output.exists() and not (output / ".ghosttrace-build.json").is_file()):
        raise ValueError("Refusing to replace an unowned dist directory")
    if json.loads((root / "vercel.json").read_text()) != vercel_config():
        raise ValueError("vercel.json differs from the reviewed route/security configuration")
    with tempfile.TemporaryDirectory(prefix=".ghosttrace-build-", dir=root) as temporary:
        stage = Path(temporary) / "site"
        cache = Path(temporary) / "extracted"
        stage.mkdir(); cache.mkdir()
        dataset = root / "dataset"
        verified_extractions(dataset, root / "deployment" / "evidence-text.json", cache)
        engine = GhostTraceEngine(dataset, cache_dir=cache)
        if engine.evidence.extraction_warnings:
            raise ValueError("Evidence extraction warnings prevent a production build")
        workstation = Workstation(engine)
        for asset in sorted(UI_ASSETS):
            shutil.copyfile(root / "code" / "ui" / asset, stage / asset)
        write_json(stage / "data" / "summary.json", workstation.summary())
        write_json(stage / "data" / "health.json", {"status": "ok", "mode": "read-only-build-snapshot", **engine.diagnostics()})
        write_json(stage / "data" / "cases.json", workstation.cases())
        for case_id in workstation.requests:
            write_json(stage / "data" / "cases" / f"{case_id}.json", workstation.case_detail(case_id))
        (stage / "data" / "output.csv").write_bytes(workstation.export_csv())
        validation = validate_output(stage / "data" / "output.csv", dataset / "deletion_requests.csv")
        if not validation["valid"]:
            raise ValueError(f"Production CSV validation failed: {len(validation['errors'])} errors")
        evidence_dir = stage / "data" / "evidence"
        evidence_dir.mkdir()
        for evidence in workstation.files.values():
            source = (dataset / evidence.path).resolve()
            if dataset.resolve() not in source.parents or not source.is_file():
                raise ValueError("Manifest source unavailable or outside dataset")
            if not evidence.file_id.replace("_", "").isalnum():
                raise ValueError("Invalid evidence ID")
            shutil.copyfile(source, evidence_dir / evidence.file_id)
        fingerprints = {p.relative_to(stage).as_posix(): digest(p.read_bytes()) for p in sorted(stage.rglob("*")) if p.is_file()}
        manifest = {"schemaVersion": 1, "mode": "read-only-build-snapshot", "files": fingerprints,
                    "caseCount": len(workstation.requests), "evidenceCount": len(workstation.files)}
        write_json(stage / ".ghosttrace-build.json", manifest)
        if output.exists():
            backup = Path(temporary) / "previous"
            output.rename(backup)
        try:
            stage.rename(output)
        except OSError:
            if "backup" in locals() and backup.exists():
                backup.rename(output)
            raise
    return {"output": "dist", "files": len(fingerprints), "bytes": sum(p.stat().st_size for p in output.rglob("*") if p.is_file()),
            "cases": len(workstation.requests), "evidence": len(workstation.files), "csvValid": True}


if __name__ == "__main__":
    print(json.dumps(build(), indent=2))
