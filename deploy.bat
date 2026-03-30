@echo off
REM ============================================================
REM  deploy.bat – mirror both behavior packs into the Minecraft
REM              development_behavior_packs folder.
REM
REM  - Uses robocopy /MIR so the destination exactly matches
REM    the source (extra files in dest are removed).
REM  - Junctions (scripts\shared) are excluded with /XJ and the
REM    real shared\ folder is copied into each pack separately.
REM  - Edit DEST_HG / DEST_ZI below if your folder names differ.
REM ============================================================

setlocal

SET "REPO=%~dp0"
SET "DEV=%USERPROFILE%\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs"

REM ── destination folder names ────────────────────────────────
SET "DEST_HG=%DEV%\HarvestGuard"
SET "DEST_ZI=%DEV%\ZipIt"
SET "DEST_DD=%DEV%\DeepDarkSurvivalKit"
SET "DEST_OD=%DEV%\OreDetector"
REM ────────────────────────────────────────────────────────────

echo.
echo Deploying HarvestGuard...
robocopy "%REPO%HarvestGuard" "%DEST_HG%" /MIR /XJ /NP /NDL
if %ERRORLEVEL% geq 8 ( echo [ERROR] HarvestGuard copy failed && goto :error )

robocopy "%REPO%shared" "%DEST_HG%\scripts\shared" /MIR /NP /NDL
if %ERRORLEVEL% geq 8 ( echo [ERROR] HarvestGuard shared copy failed && goto :error )

echo.
echo Deploying ZipIt...
robocopy "%REPO%ZipIt" "%DEST_ZI%" /MIR /XJ /NP /NDL
if %ERRORLEVEL% geq 8 ( echo [ERROR] ZipIt copy failed && goto :error )

robocopy "%REPO%shared" "%DEST_ZI%\scripts\shared" /MIR /NP /NDL
if %ERRORLEVEL% geq 8 ( echo [ERROR] ZipIt shared copy failed && goto :error )

echo.
echo Deploying Deep Dark Survival Kit...
robocopy "%REPO%Deep Dark Survival Kit" "%DEST_DD%" /MIR /XJ /NP /NDL
if %ERRORLEVEL% geq 8 ( echo [ERROR] Deep Dark Survival Kit copy failed && goto :error )

echo.
echo Deploying Ore Location Detector...
robocopy "%REPO%OreDetector" "%DEST_OD%" /MIR /XJ /NP /NDL
if %ERRORLEVEL% geq 8 ( echo [ERROR] OreDetector copy failed && goto :error )

robocopy "%REPO%shared" "%DEST_OD%\scripts\shared" /MIR /NP /NDL
if %ERRORLEVEL% geq 8 ( echo [ERROR] OreDetector shared copy failed && goto :error )

echo.
echo Done. All packs deployed.

goto :eof

:error
echo.
echo Deploy failed. Check output above.
exit /b 1

:eof
pause