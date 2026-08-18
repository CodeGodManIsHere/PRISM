#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: verify-ipa.sh /path/to/PRISM.ipa" >&2
  exit 64
fi

ipa_path="$1"
script_directory=$(cd "$(dirname "$0")" && pwd)

[[ -f "$ipa_path" ]] || { echo "IPA missing: $ipa_path" >&2; exit 1; }
/usr/bin/unzip -tq "$ipa_path" >/dev/null

python3 - "$ipa_path" <<'PY'
from pathlib import PurePosixPath
from zipfile import ZipFile
import sys

with ZipFile(sys.argv[1]) as archive:
    for entry in archive.infolist():
        name = entry.filename
        path = PurePosixPath(name)
        if not name or path.is_absolute() or ".." in path.parts or "\\" in name:
            raise SystemExit(f"Unsafe IPA member path: {name!r}")
PY

temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/prism-ipa-verify.XXXXXX")
trap 'rm -rf "$temporary_directory"' EXIT
/usr/bin/unzip -q "$ipa_path" -d "$temporary_directory"

app_count=$(find "$temporary_directory/Payload" -mindepth 1 -maxdepth 1 -type d -name '*.app' | awk 'END { print NR + 0 }')
[[ "$app_count" -eq 1 ]] || { echo "IPA must contain exactly one top-level app; found $app_count" >&2; exit 1; }

extracted_app="$temporary_directory/Payload/PRISM.app"
[[ -d "$extracted_app" ]] || { echo "IPA does not contain Payload/PRISM.app" >&2; exit 1; }
"$script_directory/verify-extension.sh" "$extracted_app"

echo "Extracted and verified unsigned IPA: $ipa_path"
