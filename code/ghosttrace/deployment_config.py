"""Explicit configuration for a finite read-only static Vercel deployment."""
from .http_security import SECURITY_HEADERS

REWRITES = [
    {"source": "/api/summary", "destination": "/data/summary.json"},
    {"source": "/api/health", "destination": "/data/health.json"},
    {"source": "/api/cases", "destination": "/data/cases.json"},
    {"source": "/api/cases/:caseId", "destination": "/data/cases/:caseId.json"},
    {"source": "/api/export.csv", "destination": "/data/output.csv"},
    {"source": "/api/evidence/:evidenceId", "destination": "/data/evidence/:evidenceId"},
]


def vercel_config() -> dict:
    return {
        "$schema": "https://openapi.vercel.sh/vercel.json",
        "framework": None,
        "buildCommand": "npm run build", "installCommand": "npm ci", "outputDirectory": "dist",
        "rewrites": REWRITES,
        "headers": [
            {"source": "/(.*)", "headers": [
                *({"key": key, "value": value} for key, value in SECURITY_HEADERS.items()),
                {"key": "Cache-Control", "value": "public, max-age=0, must-revalidate"},
            ]},
            {"source": "/api/:path*", "headers": [{"key": "Cache-Control", "value": "no-store"}]},
            {"source": "/api/export.csv", "headers": [{"key": "Content-Disposition", "value": 'attachment; filename="output.csv"'}]},
            {"source": "/api/evidence/:evidenceId", "headers": [
                {"key": "Content-Type", "value": "application/octet-stream"},
                {"key": "Content-Disposition", "value": "attachment"},
            ]},
        ],
    }
