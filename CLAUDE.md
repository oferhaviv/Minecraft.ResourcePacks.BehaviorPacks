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
**ZipIt:** `zp:settings`, `zp:advance`, `zp:active`, `zp:restore`, `zp:show`, `zp:usage` (or any part of `zp:` will show usage)

## ZipIt Settings Architecture

ZipIt has two settings menus driven by `ui_schema.js` → `buildUiSections(rules, settingsType)`.

### Basic (`zp:settings`, `settingsType = "basic"`)
| Element | Description |
|---------|-------------|
| Enable ZipIt | Master on/off toggle |
| Miner profile | Enables/disables all miner-tagged rules at once |
| Builder profile | Enables/disables all builder-tagged rules at once |
| Inventory Sort | Toggle the sort feature |
| Debug Level | None / Basic dropdown |

### Advanced (`zp:advance`, `settingsType = "advanced"`)
| Element | Description |
|---------|-------------|
| Enable ZipIt | Master on/off toggle |
| Inventory Sort | Toggle the sort feature |
| Per-rule toggles | One toggle per packing rule, grouped by profile tag |
| Debug Level | None / Basic dropdown |

### Profile → Rule relationship (critical invariant)
- A rule's effective enabled state = **explicit per-rule override** → **profile default** → **rule default** (resolved by `resolveRuleEnabled` in `ui_schema.js`).
- Rules with a **single profile** (e.g. `miner`): disabled when that profile is off and no explicit override exists.
- Rules with **both profiles** (e.g. `iron_ingot`): disabled only when **both** profiles are off, or an explicit override disables it.
- When saving the advanced menu, `applyFormValuesToSettings` compares each rule toggle against `profileDefault()`. If they **match** → the explicit override is cleared (profile stays in control). If they **differ** → the explicit override is written. This ensures that turning `miner` back on in the basic menu re-enables all miner rules that weren't individually overridden.
- The basic menu never touches `settings.rules` — it only writes `settings.profiles.*`. The advanced menu never touches `settings.profiles.*`.

### Rule enabled state flow
```
Basic saves:   settings.profiles.miner = false
Advanced shows: resolveRuleEnabled(settings, rule) → profiles.miner=false → coal shows OFF
User hits OK:  coal toggle=false, profileDefault=false → match → no explicit override written
Basic saves:   settings.profiles.miner = true
Advanced shows: coal shows ON again (profile controls it)
```
