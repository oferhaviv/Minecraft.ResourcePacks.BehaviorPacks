@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  deploy_to_server.bat
REM  1. Runs local deploy.bat
REM  2. Reads versions/UUIDs from each pack's manifest.json
REM  3. Writes world_behavior_packs.json to SERVER_PACKS_JSON
REM  4. (TODO) SFTP upload
REM ============================================================

REM ── Configurable output path ─────────────────────────────────
set SERVER_PACKS_JSON=C:\path\to\server\world_behavior_packs.json

REM ── Repo root (directory of this script) ────────────────────
set REPO_ROOT=%~dp0

echo.
echo === Step 1: Local deploy ===
call "%REPO_ROOT%deploy.bat"
if errorlevel 1 (
    echo [ERROR] deploy.bat failed. Aborting.
    exit /b 1
)

echo.
echo === Step 2: Generating world_behavior_packs.json ===

python -c "
import json, sys, os

repo = r'%REPO_ROOT%'
packs = ['HarvestGuard', 'ZipIt', 'OreDetector']
out_path = r'%SERVER_PACKS_JSON%'

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

# Ensure output directory exists
os.makedirs(os.path.dirname(out_path), exist_ok=True)

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(entries, f, indent=2)
    f.write('\n')

# Write versions to a temp file so the bat can read them
with open(os.path.join(repo, '_deploy_versions.tmp'), 'w') as f:
    for pack, ver in versions.items():
        f.write(f'{pack}={ver}\n')

print('OK')
"

if errorlevel 1 (
    echo [ERROR] Failed to generate world_behavior_packs.json.
    exit /b 1
)

REM ── Read versions from temp file ─────────────────────────────
for /f "tokens=1,2 delims==" %%A in (%REPO_ROOT%_deploy_versions.tmp) do (
    set "VER_%%A=%%B"
)
del "%REPO_ROOT%_deploy_versions.tmp" 2>nul

REM ── TODO: SFTP upload ─────────────────────────────────────────
REM TODO: SFTP upload to server
REM sftp user@host "put world_behavior_packs.json /server/path/"

echo.
echo === Deploy to Server Complete ===
echo HarvestGuard : !VER_HarvestGuard!
echo ZipIt        : !VER_ZipIt!
echo OreDetector  : !VER_OreDetector!
echo world_behavior_packs.json updated at %SERVER_PACKS_JSON%
echo.

endlocal
