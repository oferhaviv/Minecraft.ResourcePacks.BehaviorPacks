# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a Minecraft Bedrock Edition behavior packs repository containing two add-ons:
- **HarvestGuard** — prevents accidental crop destruction before ripeness
- **ZipIt** — automatically compacts inventory items into storage blocks and sorts items

Both packs are written in JavaScript using the `@minecraft/server` 2.5.0 and `@minecraft/server-ui` 2.0.0 APIs (format_version: 2 manifests).

## Status
- HarvestGuard: COMPLETE - ready for BLOCKLAB submission - will be validate on multi-players server
- ZipIt: IN PROGRESS - focus here

## Shared Code
- shared folder is shared between both addons (linked)
- Changes there affect both

## Current Task
Working on ZipIt - review for for bugs, edge cases, and missing error handling and production readiness.
focus on issues that would affect actual gameplay on a multiplayer server.
prioritize: crashes, data loss, and broken core features.



## Development Workflow

### Initial Setup (run once after cloning)
```bat
setup.bat
```
Creates directory junctions: `HarvestGuard/scripts/shared` and `ZipIt/scripts/shared` both point to the root `shared/` folder.

### Deploy to Minecraft
```bat
deploy.bat
```
Mirrors both packs to `%USERPROFILE%\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs` using robocopy. Handles junctions by excluding them (`/XJ`) and copying the real `shared/` folder into each pack separately.

### Sync back from Minecraft (after in-game edits)
```bat
upload_conent.bat
```
Copies from Minecraft dev folder back to repo, then auto-commits and pushes with a timestamp.

## Architecture

### Shared Modules (`shared/`)
- **logger.js** — logger factory with debug-level gating and critical message override; used by both packs
- **playerSettingsStore.js** — generic per-player settings backed by Bedrock dynamic properties with in-memory cache; used by both packs

The `shared/` folder is symlinked into each pack's `scripts/shared/` via junctions. Git ignores these junctions; `deploy.bat` copies the real folder contents instead.

### Pack Structure (both packs follow this pattern)
```
<PackName>/
├── manifest.json
├── pack_icon.png
└── scripts/
    ├── main.js              # Entry point, event subscriptions
    ├── settingsManager.js   # Per-player settings, commands, UI wiring
    ├── devValidation.js     # DEV-ONLY: remove before publishing
    ├── shared/              # Junction → root shared/
    ├── data/                # Config, schemas, game data constants
    └── ui/                  # UI dialog logic
```

### devValidation.js
Both packs contain a `devValidation.js` file that builds an in-game test environment (spawns test blocks/crops at every growth stage). This is **DEV-ONLY** — it must be removed before publishing. Triggered via `/scriptevent hg:validation` (HarvestGuard) after setting debug level to Basic.

## Manifest Versioning

Versions follow `major.minor.patch`. **Always bump the 3rd (patch) digit** by default unless the change warrants a minor or major bump.

- HarvestGuard: `HarvestGuard/manifest.json` — version in the `header` section
- ZipIt: `ZipIt/manifest.json` — version in the `header` section


## Key In-Game Commands

**HarvestGuard:** `hg:settings`, `hg:active`, `hg:restore`, `hg:show`, `hg:usage` (or any part of `hg:` will show usage)
**ZipIt:** `zp:settings`, `zp:advance`, `zp:active`, `zp:restore`,`zp:show`,   `zp:usage` (or any part of `zp:` will show usage)
