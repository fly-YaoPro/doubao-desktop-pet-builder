#!/usr/bin/env python3
"""Create an isolated Electron desktop-pet project from the bundled template."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from validate_pet_spec import validate


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "assets" / "electron-template"
FIXTURE = ROOT / "assets" / "regression-fixture" / "orange-cat"


def npm_name(app_id: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", app_id.lower()).strip("-")
    return value[-80:] or "desktop-pet"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True, type=Path)
    sources = parser.add_mutually_exclusive_group(required=True)
    sources.add_argument("--assets", type=Path)
    sources.add_argument("--use-regression-fixture", action="store_true")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    try:
        spec = json.loads(args.spec.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Cannot read spec: {exc}", file=sys.stderr)
        return 2
    errors = validate(spec)
    if errors:
        print("Spec validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 2

    output = args.output.resolve()
    if output.exists():
        print(f"Refusing to overwrite existing path: {output}", file=sys.stderr)
        return 3
    if not TEMPLATE.is_dir():
        print(f"Template missing: {TEMPLATE}", file=sys.stderr)
        return 4

    asset_source = FIXTURE if args.use_regression_fixture else args.assets
    assert asset_source is not None
    asset_source = asset_source.resolve()
    required = {spec["character"]["coreAsset"], *(frame for state in spec["states"] for frame in state["frames"])}
    missing = sorted(name for name in required if not (asset_source / name).is_file())
    if missing:
        print(f"Asset directory is missing {len(missing)} file(s): {missing}", file=sys.stderr)
        return 5

    shutil.copytree(TEMPLATE, output, ignore=shutil.ignore_patterns(".gitkeep", "node_modules", "out", "release", ".webpack"))
    pet_dir = output / "src" / "assets" / "pet"
    pet_dir.mkdir(parents=True, exist_ok=True)
    for name in sorted(required):
        source = asset_source / name
        target = pet_dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    (output / "pet-spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    package_path = output / "package.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    package["name"] = npm_name(spec["app"]["appId"])
    package["productName"] = spec["app"]["name"]
    package["version"] = spec["app"]["version"]
    package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lock_path = output / "package-lock.json"
    if lock_path.is_file():
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        lock["name"] = package["name"]
        lock["version"] = package["version"]
        root_package = lock.get("packages", {}).get("")
        if isinstance(root_package, dict):
            root_package["name"] = package["name"]
            root_package["version"] = package["version"]
        lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.use_regression_fixture:
        marker = output / "REGRESSION_FIXTURE_ONLY.txt"
        marker.write_text("This project uses the orange-cat regression fixture. Replace it before user delivery.\n", encoding="utf-8")

    print(f"Created desktop-pet project: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
