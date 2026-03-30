"""
Reads UUID and version from each pack's manifest.json and writes
world_behavior_packs.json to the repo root.

Usage: python generate_world_behavior_packs.py <repo_root>
"""

import json
import os
import sys

repo = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
packs = ["HarvestGuard", "ZipIt", "OreDetector"]
out_path = os.path.join(repo, "world_behavior_packs.json")

entries = []
versions = {}

for pack in packs:
    manifest_path = os.path.join(repo, pack, "manifest.json")
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            m = json.load(f)
        header = m["header"]
        entries.append({
            "pack_id": header["uuid"],
            "version": header["version"],
        })
        versions[pack] = ".".join(str(v) for v in header["version"])
    except Exception as e:
        print(f"[ERROR] Failed to read {manifest_path}: {e}", file=sys.stderr)
        sys.exit(1)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(entries, f, indent=2)
    f.write("\n")

# Write versions to a temp file so the bat can read them
tmp_path = os.path.join(repo, "_deploy_versions.tmp")
with open(tmp_path, "w") as f:
    for pack, ver in versions.items():
        f.write(f"{pack}={ver}\n")

print(f"OK — {out_path}")
