# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a Minecraft Bedrock Edition behavior packs repository containing two add-ons:
- **HarvestGuard** — prevents accidental crop destruction before ripeness
- **ZipIt** — automatically compacts inventory items into storage blocks and consolidates partial stacks

Both packs are written in JavaScript using the `@minecraft/server` 2.5.0 and `@minecraft/server-ui` 2.0.0 APIs (format_version: 2 manifests).

## Status
- HarvestGuard: COMPLETE - ready for BLOCKLAB submission - will be validated on multi-player server
- ZipIt: IN PROGRESS - active bug fixing; currently at v1.1.0 — see `ZipIt/OPEN_ISSUES.md` for full history

## Shared Code
- `shared/` folder is shared between both addons (linked via junction)
- Changes there affect both packs

## Current Task
ZipIt bug fixing is ongoing. All known critical/high bugs are resolved as of v1.1.0.
Workflow: fix bug → bump patch version in `ZipIt/manifest.json` → update `ZipIt/OPEN_ISSUES.md` → commit and push.

---

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

---

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
Both packs contain a `devValidation.js` file that builds an in-game test environment. This is **DEV-ONLY** — it must be removed before publishing.
- ZipIt: triggered via `/scriptevent zp:validation` — **requires Debug Level set to Basic** (enforced in code; shows error message otherwise)
- HarvestGuard: triggered via `/scriptevent hg:validation` after setting debug level to Basic

---

## Manifest Versioning

Versions follow `major.minor.patch`. **Always bump the patch digit** by default unless the change warrants a minor or major bump.

- HarvestGuard: `HarvestGuard/manifest.json` — version in the `header` section
- ZipIt: `ZipIt/manifest.json` — current version **1.1.0**

---

## Key In-Game Commands

**HarvestGuard:** `hg:settings`, `hg:active`, `hg:restore`, `hg:show`, `hg:usage` (or any `hg:` prefix shows usage)
**ZipIt:** `zp:settings`, `zp:advance`, `zp:active`, `zp:restore`, `zp:show`, `zp:usage` (or any `zp:` prefix shows usage)

---

## ZipIt Settings Architecture

ZipIt has two settings menus driven by `ui_schema.js` → `buildUiSections(rules, settingsType)`.

### Basic (`zp:settings`, `settingsType = "basic"`)
| Element | Description |
|---------|-------------|
| Enable ZipIt | Master on/off toggle |
| Miner profile | Enables/disables all miner-tagged rules at once |
| Builder profile | Enables/disables all builder-tagged rules at once |
| Consolidate Stacks | Toggle the stack-merge feature (was "Inventory Sort") |
| Debug Level | None / Basic dropdown |

### Advanced (`zp:advance`, `settingsType = "advanced"`)
| Element | Description |
|---------|-------------|
| Enable ZipIt | Master on/off toggle |
| Consolidate Stacks | Toggle the stack-merge feature |
| Per-rule toggles | One toggle per packing rule, grouped by profile tag |
| Debug Level | None / Basic dropdown |

### Profile → Rule relationship (critical invariant)
- A rule's effective enabled state = **explicit per-rule override** → **profile default** → **rule default** (resolved by `resolveRuleEnabled` in `ui_schema.js`).
- Rules with a **single profile** (e.g. `miner`): disabled when that profile is off and no explicit override exists.
- Rules with **both profiles** (e.g. `iron_ingot`, `redstone`): disabled only when **both** profiles are off.
- When saving the advanced menu, `applyFormValuesToSettings` compares each rule toggle against `profileDefault()`. Match → clear explicit override (profile stays in control). Differ → write explicit override.
- **Basic menu clears explicit enables when profiles go off**: when the basic menu sets a profile to `false`, any explicit `enabled:true` override for rules in that profile is cleared so packing reliably stops. Explicit `enabled:false` overrides are left alone.
- The basic menu never touches `settings.rules` (except clearing the above). The advanced menu never touches `settings.profiles.*`.

### Rule enabled state flow
```
Basic saves:    settings.profiles.miner = false
                → clears any explicit enabled:true overrides for miner rules
Advanced shows: resolveRuleEnabled → profiles.miner=false → coal shows OFF
User hits OK:   coal toggle=false, profileDefault=false → match → no explicit override written
Basic saves:    settings.profiles.miner = true
Advanced shows: coal shows ON again (profile controls it)
```

---

## ZipIt Core Processing (main.js)

### Inventory change pipeline
```
entityInventoryChange (afterEvent)
  → schedulePlayerProcess(player)    — deduplicates via pendingPlayers Set
  → system.run(flush)                — one flush per tick for all pending players
  → processPlayer(player)
      ├─ 5-tick cooldown check (lastProcessedTick)
      │    └─ if blocked: schedule one retry at cooldown expiry (retryScheduled Set)
      ├─ run all enabled packing rules (RULES loop)
      └─ consolidateInventory() if features.inventorySort is on
```

### Cooldown design (critical — do not remove)
- `lastProcessedTick` Map tracks when each player was last processed.
- `PROCESS_COOLDOWN_TICKS = 5`: ZipIt's own `setItem` calls fire `entityInventoryChange`, which would re-queue the player. The cooldown absorbs those self-triggered events.
- When the cooldown blocks a call, `retryScheduled` ensures a one-shot retry fires at expiry, so legitimate inventory changes (e.g. moving items between slots) are not silently dropped.
- Clean up on `playerLeave`: `lastProcessedTick.delete`, `retryScheduled.delete`.

### `consolidateInventory` (replaces old alphabetical sort)
- Merges partial stacks of the same `typeId` **in-place** — slots are never reordered (hotbar safe).
- Fills the slot with the most items first; overflows to the next, respecting `maxStack`.
- Skips: non-stackable (`maxAmount <= 1`), items with a `nameTag`, items with lore, enchanted items.
- Runs on **every** inventory change when `features.inventorySort` is on — not gated on packing.
- Settings UI label: **"Consolidate Stacks"** (stored as `features.inventorySort` for backwards compat).

### `isValid` — property, not method
`Container.isValid` and `Entity.isValid` are **properties** (boolean) in `@minecraft/server` 2.5.0.
Calling `isValid()` throws `TypeError: not a function`. Always use `container.isValid` (no parens).

### Cascade packing
Rules run sequentially in one `processPlayer` call. nuggets→ingots→blocks can chain in a single tick (intentional). Rule order in `packing_rules.js` matters for cascades.

---

## ZipIt Bug History Summary

Full details in `ZipIt/OPEN_ISSUES.md`. Key fixes by version:

| Version | Key fix |
|---------|---------|
| 1.0.2 | BUG-01: capacity calc ignores freed source slots on full inventory |
| 1.0.3 | BUG-03/04/05/06/07: item loss on rollback failure; menu retry on disconnected player; processing loop from own setItem calls |
| 1.0.4 | BUG-08–12: consolidation feature implemented; rule-enabled dedup; settings cache clone; itemId/maxStack caches |
| 1.0.5–1.0.6 | Settings menu fixes: settingsType not forwarded on retry; import order; dead code; command fallback |
| 1.0.7 | NEW-14: replaced alphabetical sort with in-place stack consolidation (hotbar safe) |
| 1.0.8 | `zp:validation` gated on debug.level=basic |
| 1.0.9 | Consolidation not running when profiles off; packing via explicit override surviving profile disable |
| 1.1.0 | Consolidation silently dropped during cooldown window — retry-on-block fix |
