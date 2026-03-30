@echo off
REM ============================================================
REM  setup.bat – create shared module junctions
REM  Run once after cloning the repository.
REM  No admin rights required (mklink /J uses directory junctions).
REM ============================================================

echo Setting up shared module junctions...
echo.

if exist "HarvestGuard\scripts\shared" (
  echo [skip] HarvestGuard\scripts\shared already exists
) else (
  mklink /J "HarvestGuard\scripts\shared" "%~dp0shared"
  echo [done] HarvestGuard\scripts\shared
)

if exist "ZipIt\scripts\shared" (
  echo [skip] ZipIt\scripts\shared already exists
) else (
  mklink /J "ZipIt\scripts\shared" "%~dp0shared"
  echo [done] ZipIt\scripts\shared
)

if exist "OreDetector\scripts\shared" (
  echo [skip] OreDetector\scripts\shared already exists
) else (
  mklink /J "OreDetector\scripts\shared" "%~dp0shared"
  echo [done] OreDetector\scripts\shared
)

echo.
echo Done. Shared modules are now available as:
echo   HarvestGuard\scripts\shared\logger.js
echo   HarvestGuard\scripts\shared\playerSettingsStore.js
echo   ZipIt\scripts\shared\logger.js
echo   ZipIt\scripts\shared\playerSettingsStore.js
echo   OreDetector\scripts\shared\logger.js
echo   OreDetector\scripts\shared\playerSettingsStore.js
