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

python "%REPO_ROOT%generate_world_behavior_packs.py" %REPO_ROOT%
if errorlevel 1 (
    echo [ERROR] Failed to update world_behavior_packs.json.
    exit /b 1
)

REM ── Read versions from temp file ─────────────────────────────
for /f "tokens=1,2 delims==" %%A in ("%REPO_ROOT%_deploy_versions.tmp") do (
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
