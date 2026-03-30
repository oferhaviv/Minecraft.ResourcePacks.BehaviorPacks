@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  deploy_to_server.bat
REM  Reads versions/UUIDs from each pack's manifest.json and
REM  updates world_behavior_packs.json in the repo root.
REM
REM  TODO: SFTP upload to server
REM  sftp user@host "put world_behavior_packs.json /server/path/"
REM ============================================================

REM ── Repo root (directory of this script) ────────────────────
set REPO_ROOT=%~dp0

echo.
echo === Updating world_behavior_packs.json ===

python -c "
import json, sys, os

repo = r'%REPO_ROOT%'
packs = ['HarvestGuard', 'ZipIt', 'OreDetector']
out_path = os.path.join(repo, 'world_behavior_packs.json')

entries = []
versions = {}

for pack in packs:
    manifest_path = os.path.join(repo, pack, 'manifest.json')
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            m = json.load(f)
        header = m['header']
        entries.append({
            'pack_id': header['uuid'],
            'version': header['version'],
        })
        versions[pack] = '.'.join(str(v) for v in header['version'])
    except Exception as e:
        print(f'[ERROR] Failed to read {manifest_path}: {e}', file=sys.stderr)
        sys.exit(1)

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(entries, f, indent=2)
    f.write('\n')

with open(os.path.join(repo, '_deploy_versions.tmp'), 'w') as f:
    for pack, ver in versions.items():
        f.write(f'{pack}={ver}\n')

print('OK')
"

if errorlevel 1 (
    echo [ERROR] Failed to update world_behavior_packs.json.
    exit /b 1
)

REM ── Read versions from temp file ─────────────────────────────
for /f "tokens=1,2 delims==" %%A in (%REPO_ROOT%_deploy_versions.tmp) do (
    set "VER_%%A=%%B"
)
del "%REPO_ROOT%_deploy_versions.tmp" 2>nul

echo.
echo === Deploy to Server Complete ===
echo HarvestGuard : !VER_HarvestGuard!
echo ZipIt        : !VER_ZipIt!
echo OreDetector  : !VER_OreDetector!
echo world_behavior_packs.json updated at %REPO_ROOT%world_behavior_packs.json
echo.

endlocal
