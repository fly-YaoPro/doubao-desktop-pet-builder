#!/usr/bin/env python3
"""Read-only static audit for Electron desktop-pet projects."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


SKIP_DIRS = {"node_modules", ".git", ".webpack", "out", "release", "dist", "build"}
TEXT_SUFFIXES = {".js", ".cjs", ".mjs", ".ts", ".tsx", ".html", ".json"}
RULES = [
    ("critical", "node-integration", re.compile(r"nodeIntegration\s*:\s*true"), "renderer enables Node integration"),
    ("critical", "context-isolation", re.compile(r"contextIsolation\s*:\s*false"), "context isolation is disabled"),
    ("critical", "web-security", re.compile(r"webSecurity\s*:\s*false"), "web security is disabled"),
    ("high", "ipc-exposure", re.compile(r"exposeInMainWorld\([^\n]+ipcRenderer"), "preload may expose raw ipcRenderer"),
    ("high", "hardcoded-drive", re.compile(r"[\"'][A-Za-z]:\\\\"), "hard-coded Windows drive path"),
    ("high", "unsafe-html", re.compile(r"\.innerHTML\s*="), "innerHTML assignment requires taint review"),
    ("medium", "primary-display-only", re.compile(r"getPrimaryDisplay\s*\("), "primary-display-only positioning may break multi-monitor behavior"),
    ("medium", "file-path", re.compile(r"\bFile\.path\b|\.path\s*\)"), "browser File.path assumption requires Electron version review"),
    ("high", "nonexistent-api", re.compile(r"dialog\.showInputBox\s*\("), "Electron has no dialog.showInputBox API"),
]


def source_files(root: Path, excluded: set[str]):
    for path in root.rglob("*"):
        relative_parts = path.relative_to(root).parts
        if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES and not any(part in SKIP_DIRS or part in excluded for part in relative_parts):
            yield path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("project", type=Path)
    parser.add_argument("--json", dest="json_path", type=Path)
    parser.add_argument("--exclude", action="append", default=[], help="top-level directory name to exclude")
    args = parser.parse_args()
    root = args.project.resolve()
    if not root.is_dir():
        print(f"Project does not exist: {root}", file=sys.stderr)
        return 2

    findings: list[dict[str, object]] = []
    scanned = 0
    for path in source_files(root, set(args.exclude)):
        scanned += 1
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for severity, rule, pattern, message in RULES:
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                findings.append({"severity": severity, "rule": rule, "message": message, "file": str(path.relative_to(root)), "line": line})
        for match in re.finditer(r"process\.on\(\s*['\"]uncaughtException['\"][\s\S]{0,1200}?\n\s*\}\s*\);", text):
            body = match.group(0)
            if not re.search(r"\b(?:app|process)\.exit\s*\(|\bthrow\b|\.finally\s*\(", body):
                line = text.count("\n", 0, match.start()) + 1
                findings.append({"severity": "high", "rule": "exception-swallow", "message": "uncaught exception handler may swallow crashes", "file": str(path.relative_to(root)), "line": line})

    package_path = root / "package.json"
    checks = {
        "packageJson": package_path.is_file(),
        "lockFile": any((root / name).is_file() for name in ("package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml")),
        "petSpec": (root / "pet-spec.json").is_file(),
        "tests": any((root / name).exists() for name in ("tests", "test", "playwright.config.ts", "playwright.config.js")),
    }
    scripts: dict[str, str] = {}
    if package_path.is_file():
        try:
            package = json.loads(package_path.read_text(encoding="utf-8"))
            scripts = package.get("scripts", {}) if isinstance(package.get("scripts"), dict) else {}
        except (OSError, json.JSONDecodeError):
            findings.append({"severity": "critical", "rule": "invalid-package", "message": "package.json is not valid JSON", "file": "package.json", "line": 1})
    for name in ("check", "test", "test:e2e", "qa:assets", "make:win", "make:mac"):
        if name not in scripts:
            findings.append({"severity": "medium", "rule": "missing-script", "message": f"missing npm script: {name}", "file": "package.json", "line": 1})

    report = {"project": str(root), "scannedFiles": scanned, "checks": checks, "findings": findings}
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 1 if any(item["severity"] in {"critical", "high"} for item in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
