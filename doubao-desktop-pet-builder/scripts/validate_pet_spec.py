#!/usr/bin/env python3
"""Validate the public pet-spec.json contract without third-party packages."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any


CORE_STATES = {
    "idle", "blink", "walk-left", "walk-right", "happy", "sleep",
    "typing", "notify", "grab", "success", "fail", "peek",
}
INPUT_TYPES = {"single-image", "action-pack", "text", "existing-project"}
STYLES = {"preserve", "balanced-cartoon", "key-elements", "custom"}
INTERRUPTS = {"resume", "restart", "discard", "block"}
DIRECTIONS = {"neutral", "left", "right"}
APP_ID = re.compile(r"^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9-]+)+$")
SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
STATE_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def is_safe_relative(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    normalized = value.replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized):
        return False
    return ".." not in PurePosixPath(normalized).parts


def validate(spec: Any) -> list[str]:
    errors: list[str] = []

    def need(condition: bool, path: str, message: str) -> None:
        if not condition:
            errors.append(f"{path}: {message}")

    need(isinstance(spec, dict), "$", "must be an object")
    if not isinstance(spec, dict):
        return errors

    required_top = {"schemaVersion", "app", "targets", "character", "features", "states", "storage", "build"}
    need(required_top <= spec.keys(), "$", f"missing keys: {sorted(required_top - spec.keys())}")
    need(set(spec) <= required_top, "$", f"unknown keys: {sorted(set(spec) - required_top)}")
    need(spec.get("schemaVersion") == 1, "$.schemaVersion", "must equal 1")

    app = spec.get("app")
    need(isinstance(app, dict), "$.app", "must be an object")
    if isinstance(app, dict):
        need(isinstance(app.get("name"), str) and 1 <= len(app["name"]) <= 64, "$.app.name", "must be 1-64 characters")
        need(isinstance(app.get("appId"), str) and bool(APP_ID.fullmatch(app["appId"])), "$.app.appId", "must be a reverse-domain identifier")
        need(isinstance(app.get("version"), str) and bool(SEMVER.fullmatch(app["version"])), "$.app.version", "must be semver")
        need(isinstance(app.get("language"), str) and 2 <= len(app["language"]) <= 16, "$.app.language", "must be 2-16 characters")

    targets = spec.get("targets")
    need(isinstance(targets, dict), "$.targets", "must be an object")
    if isinstance(targets, dict):
        for platform in ("windows", "macos"):
            target = targets.get(platform)
            need(isinstance(target, dict), f"$.targets.{platform}", "must be an object")
            if isinstance(target, dict):
                need(type(target.get("enabled")) is bool, f"$.targets.{platform}.enabled", "must be boolean")
                allowed = {"x64"} if platform == "windows" else {"current", "arm64", "x64"}
                need(target.get("arch") in allowed, f"$.targets.{platform}.arch", f"must be one of {sorted(allowed)}")

    character = spec.get("character")
    need(isinstance(character, dict), "$.character", "must be an object")
    if isinstance(character, dict):
        need(character.get("inputType") in INPUT_TYPES, "$.character.inputType", "invalid input type")
        need(is_safe_relative(character.get("coreAsset")), "$.character.coreAsset", "must be a safe relative path")
        traits = character.get("preserveTraits")
        need(isinstance(traits, list) and len(traits) <= 20 and all(isinstance(x, str) and x for x in traits), "$.character.preserveTraits", "must be an array of up to 20 non-empty strings")
        need(character.get("style") in STYLES, "$.character.style", "invalid style")
        need(type(character.get("mirrorSafe")) is bool, "$.character.mirrorSafe", "must be boolean")

    features = spec.get("features")
    feature_keys = {"transparentWindow", "drag", "tray", "edgeSnap", "reminders", "filePocket", "dashboard", "typingReaction"}
    need(isinstance(features, dict), "$.features", "must be an object")
    if isinstance(features, dict):
        need(set(features) == feature_keys, "$.features", f"must contain exactly {sorted(feature_keys)}")
        for key in feature_keys:
            need(type(features.get(key)) is bool, f"$.features.{key}", "must be boolean")
        need(features.get("transparentWindow") is True, "$.features.transparentWindow", "must be true")

    states = spec.get("states")
    need(isinstance(states, list) and len(states) >= 12, "$.states", "must contain at least 12 states")
    seen: set[str] = set()
    if isinstance(states, list):
        for index, state in enumerate(states):
            path = f"$.states[{index}]"
            need(isinstance(state, dict), path, "must be an object")
            if not isinstance(state, dict):
                continue
            expected = {"id", "frames", "frameDurationMs", "loop", "priority", "interrupt", "cooldownMs", "direction", "anchor", "mirrorSafe"}
            need(set(state) == expected, path, f"must contain exactly {sorted(expected)}")
            state_id = state.get("id")
            need(isinstance(state_id, str) and bool(STATE_ID.fullmatch(state_id)), f"{path}.id", "invalid state id")
            if isinstance(state_id, str):
                need(state_id not in seen, f"{path}.id", "duplicate state id")
                seen.add(state_id)
            frames = state.get("frames")
            need(isinstance(frames, list) and 1 <= len(frames) <= 24 and all(is_safe_relative(x) for x in frames), f"{path}.frames", "must contain 1-24 safe relative paths")
            need(type(state.get("frameDurationMs")) is int and 40 <= state["frameDurationMs"] <= 10000, f"{path}.frameDurationMs", "must be 40-10000")
            need(type(state.get("loop")) is bool, f"{path}.loop", "must be boolean")
            need(type(state.get("priority")) is int and 0 <= state["priority"] <= 1000, f"{path}.priority", "must be 0-1000")
            need(state.get("interrupt") in INTERRUPTS, f"{path}.interrupt", "invalid strategy")
            need(type(state.get("cooldownMs")) is int and 0 <= state["cooldownMs"] <= 3600000, f"{path}.cooldownMs", "must be 0-3600000")
            need(state.get("direction") in DIRECTIONS, f"{path}.direction", "invalid direction")
            anchor = state.get("anchor")
            need(isinstance(anchor, dict) and set(anchor) == {"x", "y"}, f"{path}.anchor", "must contain x and y")
            if isinstance(anchor, dict):
                need(isinstance(anchor.get("x"), (int, float)) and 0 <= anchor["x"] <= 1, f"{path}.anchor.x", "must be 0-1")
                need(isinstance(anchor.get("y"), (int, float)) and 0 <= anchor["y"] <= 1, f"{path}.anchor.y", "must be 0-1")
            need(type(state.get("mirrorSafe")) is bool, f"{path}.mirrorSafe", "must be boolean")
        missing = CORE_STATES - seen
        need(not missing, "$.states", f"missing core states: {sorted(missing)}")

    storage = spec.get("storage")
    need(storage == {"userData": "app-user-data", "filePocket": "documents-app-name"}, "$.storage", "must use cross-platform path policies")

    build = spec.get("build")
    need(isinstance(build, dict), "$.build", "must be an object")
    if isinstance(build, dict):
        makers = build.get("makers")
        need(isinstance(makers, list) and {"squirrel", "dmg", "zip"} <= set(makers), "$.build.makers", "must include squirrel, dmg and zip")
        need(build.get("windowsArch") == "x64", "$.build.windowsArch", "must be x64")
        need(build.get("macosArch") in {"current", "arm64", "x64"}, "$.build.macosArch", "invalid architecture")
        need(build.get("unsigned") is True, "$.build.unsigned", "v1 must explicitly be unsigned")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("spec", type=Path)
    args = parser.parse_args()
    try:
        data = json.loads(args.spec.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"INVALID: cannot read JSON: {exc}", file=sys.stderr)
        return 2
    errors = validate(data)
    if errors:
        print("INVALID pet-spec.json", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"VALID pet-spec.json: {args.spec}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
