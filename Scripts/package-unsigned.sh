#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: package-unsigned.sh /path/to/PRISM.app /path/to/output.ipa" >&2
  exit 64
fi

app_path="$1"
case "$2" in
  /*) output_path="$2" ;;
  *) output_path="$PWD/$2" ;;
esac
script_directory=$(cd "$(dirname "$0")" && pwd)

"$script_directory/verify-extension.sh" "$app_path"
temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/prism-package.XXXXXX")
trap 'rm -rf "$temporary_directory"' EXIT
mkdir -p "$temporary_directory/Payload" "$(dirname "$output_path")"
cp -R "$app_path" "$temporary_directory/Payload/PRISM.app"
temporary_archive="$temporary_directory/PRISM-unsigned.ipa"

(
  cd "$temporary_directory"
  /usr/bin/zip -qry "$temporary_archive" Payload
)

mv "$temporary_archive" "$output_path"

"$script_directory/verify-ipa.sh" "$output_path"
