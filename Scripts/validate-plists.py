from pathlib import Path
import plistlib
import sys

root = Path(__file__).resolve().parent.parent
files = sorted(root.rglob("*.plist")) + sorted(root.rglob("*.entitlements"))

for file in files:
    with file.open("rb") as handle:
        plistlib.load(handle)

print(f"Property lists valid: {len(files)} files")
sys.exit(0)

