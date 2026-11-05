"""Read-only projections shared by the local API and the production site build."""
from __future__ import annotations

import csv
import io
from pathlib import Path

from .engine import GhostTraceEngine


class Workstation:
    def __init__(self, engine: GhostTraceEngine):
        self.engine = engine
        self.decisions = {item.case_id: item for item in engine.audit_all()}
        self.requests = {item.case_id: item for item in engine.cases}
        self.files = {item.file_id: item for item in engine.evidence.files}

    def summary(self) -> dict:
        counts = {status: 0 for status in ("COMPLETE", "INCOMPLETE", "NOT_APPLICABLE")}
        for decision in self.decisions.values():
            counts[decision.deletion_status] += 1
        return {
            "total": len(self.decisions), "counts": counts,
            "evidenceFiles": len(self.files),
            "extractedFiles": len(self.files) - len(self.engine.evidence.extraction_warnings),
            "observations": len(self.engine.evidence.observations),
            "warnings": sum(bool(item.warnings) for item in self.decisions.values()),
        }

    def cases(self, query: str = "", status: str = "") -> list[dict]:
        needle, status = query.casefold().strip(), status.upper()
        result = []
        for case in self.engine.cases:
            decision = self.decisions[case.case_id]
            if status and decision.deletion_status != status:
                continue
            if needle and needle not in f"{case.case_id} {case.email} {decision.user_id}".casefold():
                continue
            result.append({
                "caseId": case.case_id, "email": case.email, "userId": decision.user_id,
                "auditAt": case.audit_at.isoformat(), "status": decision.deletion_status,
                "confidence": decision.confidence, "stepCount": len(decision.steps),
                "resourceCount": len({(step.system_id, step.resource_id) for step in decision.steps}),
                "warningCount": len(decision.warnings),
            })
        return result

    def case_detail(self, case_id: str) -> dict | None:
        case, decision = self.requests.get(case_id), self.decisions.get(case_id)
        if case is None or decision is None:
            return None
        engine = self.engine
        identity = engine.identities.resolve(case)
        aliases = engine.identities.aliases_at(identity, case) if identity else set()
        observations = [item for item in engine.evidence.eligible(case.audit_at)
                        if engine.evidence.matches(item, aliases, case.audit_at)]
        observations.sort(key=lambda item: (item.observed_at, item.system_id, item.resource_id))
        return {
            "case": {
                "caseId": case.case_id, "email": case.email,
                "requestedAt": case.requested_at.isoformat(), "reportedStatus": case.reported_status,
                "reportedAt": case.reported_at.isoformat(), "auditAt": case.audit_at.isoformat(),
                "requestText": case.request_text,
            },
            "decision": {
                "status": decision.deletion_status, "confidence": decision.confidence,
                "userId": decision.user_id, "steps": [step.to_dict() for step in decision.steps],
                "warnings": decision.warnings, "evidenceIds": decision.evidence_ids,
            },
            "identity": {"userId": identity.user_id if identity else "",
                         "aliasCount": len(aliases), "aliases": sorted(aliases)},
            "observations": [{
                "systemId": item.system_id, "resourceId": item.resource_id,
                "category": item.category, "state": item.state,
                "observedAt": item.observed_at.isoformat(), "evidenceId": item.evidence_id,
                "confidence": item.confidence,
                "policyAction": engine.policy.action_for(item) if engine.policy.supports(item.category) else "",
                "policyTarget": engine.policy.target_state(item) if engine.policy.supports(item.category) else "",
                "linkType": "direct identifier" if item.subjects & aliases else "activity ownership",
                "sourceName": Path(self.files[item.evidence_id].path).name if item.evidence_id in self.files else "",
            } for item in observations],
        }

    def export_csv(self) -> bytes:
        buffer = io.StringIO(newline="")
        writer = csv.DictWriter(buffer, fieldnames=["case_id", "deletion_status", "steps_json"])
        writer.writeheader()
        writer.writerows(decision.to_row() for decision in self.decisions.values())
        return buffer.getvalue().encode("utf-8")
