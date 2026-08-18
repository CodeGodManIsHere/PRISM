#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: verify-extension.sh /path/to/PRISM.app" >&2
  exit 64
fi

app_path="$1"
extension_path="$app_path/PlugIns/PRISMSafariExtension.appex"

python3 - "$app_path" "$extension_path" <<'PY'
import json
import os
import plistlib
import sys
from pathlib import Path, PurePosixPath

app = Path(sys.argv[1])
extension = Path(sys.argv[2])


def fail(message: str) -> None:
    raise SystemExit(message)


def require_directory(location: Path, label: str) -> None:
    if not location.is_dir():
        fail(f"{label} missing: {location}")


def require_file(location: Path, label: str) -> None:
    if not location.is_file():
        fail(f"{label} missing: {location}")
    if location.stat().st_size == 0:
        fail(f"{label} is empty: {location}")


def read_plist(location: Path) -> dict:
    require_file(location, "Property list")
    try:
        with location.open("rb") as stream:
            value = plistlib.load(stream)
    except Exception as error:
        fail(f"Invalid property list {location}: {error}")
    if not isinstance(value, dict):
        fail(f"Property list root must be a dictionary: {location}")
    return value


def verify_executable(bundle: Path, info: dict, label: str) -> None:
    executable_name = info.get("CFBundleExecutable")
    if not isinstance(executable_name, str) or not executable_name:
        fail(f"{label} CFBundleExecutable is missing")
    executable = bundle / executable_name
    require_file(executable, f"{label} executable")
    if not os.access(executable, os.X_OK):
        fail(f"{label} executable is not executable: {executable}")
    with executable.open("rb") as stream:
        magic = stream.read(4)
    macho_magics = {
        b"\xfe\xed\xfa\xce",
        b"\xce\xfa\xed\xfe",
        b"\xfe\xed\xfa\xcf",
        b"\xcf\xfa\xed\xfe",
        b"\xca\xfe\xba\xbe",
        b"\xbe\xba\xfe\xca",
        b"\xca\xfe\xba\xbf",
        b"\xbf\xba\xfe\xca",
    }
    if magic not in macho_magics:
        fail(f"{label} executable is not Mach-O: {executable}")


def canonical_manifest_path(value: object) -> str:
    if not isinstance(value, str) or not value:
        fail(f"Invalid manifest resource path: {value!r}")
    candidate = PurePosixPath(value)
    if candidate.is_absolute() or ".." in candidate.parts or str(candidate) != value:
        fail(f"Unsafe or non-canonical manifest resource path: {value}")
    return value


def icon_paths(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [entry for entry in value.values() if isinstance(entry, str)]
    return []


require_directory(app, "App bundle")
require_directory(extension, "Embedded Safari extension")

app_info = read_plist(app / "Info.plist")
extension_info = read_plist(extension / "Info.plist")
verify_executable(app, app_info, "App")
verify_executable(extension, extension_info, "Extension")

extension_configuration = extension_info.get("NSExtension")
if not isinstance(extension_configuration, dict):
    fail("Extension Info.plist has no NSExtension dictionary")
if extension_configuration.get("NSExtensionPointIdentifier") != "com.apple.Safari.web-extension":
    fail(f"Wrong extension point: {extension_configuration.get('NSExtensionPointIdentifier')!r}")
principal_class = extension_configuration.get("NSExtensionPrincipalClass")
if not isinstance(principal_class, str) or not principal_class.endswith(".SafariWebExtensionHandler"):
    fail(f"Wrong extension principal class: {principal_class!r}")

manifest_path = extension / "manifest.json"
require_file(manifest_path, "Extension manifest at bundle root")
if (extension / "Resources" / "manifest.json").exists():
    fail("manifest.json was incorrectly nested under Resources/")
try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
except Exception as error:
    fail(f"Invalid extension manifest: {error}")
if manifest.get("manifest_version") != 3:
    fail("Built extension manifest is not Manifest V3")

required_directories = (
    "background",
    "content",
    "icons",
    "popup",
    "rules",
    "shared",
    "PrivacyEngine",
    "DarkModeEngine",
)
for relative in required_directories:
    require_directory(extension / relative, f"Extension runtime directory {relative}/")

required_files = (
    "manifest.json",
    "background/background.js",
    "content/content-script.js",
    "content/element-picker.js",
    "icons/prism.svg",
    "popup/popup.css",
    "popup/popup.html",
    "popup/popup.js",
    "rules/balanced.json",
    "rules/minimal.json",
    "rules/strict.json",
    "shared/protocol.js",
    "PrivacyEngine/Compiler/compile-rules.mjs",
    "PrivacyEngine/Compiler/custom-rule-compiler.js",
    "PrivacyEngine/Models/settings-resolution.js",
    "PrivacyEngine/Parser/filter-parser.mjs",
    "PrivacyEngine/Rules/balanced-rules.json",
    "PrivacyEngine/Rules/minimal-rules.json",
    "PrivacyEngine/Rules/strict-rules.json",
    "PrivacyEngine/Sanitizer/url-sanitizer.js",
    "DarkModeEngine/Analyzer/native-dark.js",
    "DarkModeEngine/Color/color-science.js",
    "DarkModeEngine/Mutation/mutation-queue.js",
    "DarkModeEngine/SiteFixes/site-fixes.js",
    "DarkModeEngine/Transformer/dark-engine.js",
)
for relative in required_files:
    require_file(extension / relative, f"Extension runtime file {relative}")

referenced_resources: list[object] = [
    manifest.get("background", {}).get("service_worker"),
    manifest.get("action", {}).get("default_popup"),
    manifest.get("options_page"),
    manifest.get("options_ui", {}).get("page"),
    manifest.get("devtools_page"),
]
referenced_resources.extend(icon_paths(manifest.get("icons")))
referenced_resources.extend(icon_paths(manifest.get("action", {}).get("default_icon")))
for content_script in manifest.get("content_scripts", []):
    referenced_resources.extend(content_script.get("js", []))
    referenced_resources.extend(content_script.get("css", []))
for ruleset in manifest.get("declarative_net_request", {}).get("rule_resources", []):
    referenced_resources.append(ruleset.get("path"))

for value in referenced_resources:
    if value is None:
        continue
    relative = canonical_manifest_path(value)
    require_file(extension / relative, f"Manifest resource {relative}")

for ruleset in manifest.get("declarative_net_request", {}).get("rule_resources", []):
    relative = canonical_manifest_path(ruleset.get("path"))
    try:
        rules = json.loads((extension / relative).read_text(encoding="utf-8"))
    except Exception as error:
        fail(f"Invalid built DNR ruleset {relative}: {error}")
    if not isinstance(rules, list):
        fail(f"Built DNR ruleset must contain an array: {relative}")

print("Verified app bundle, embedded Safari extension, Mach-O executables, and runtime resources")
PY
