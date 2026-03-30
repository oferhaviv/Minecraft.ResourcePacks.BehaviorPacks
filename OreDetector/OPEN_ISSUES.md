# OreDetector — Open Issues & TODOs

Current version: **1.0.7**

---

## Open Issues

### TODO-01 — Vertical indicator (up/down) missing
**Priority:** Low
The HUD arrow shows horizontal compass direction only. When an ore is significantly above or below the player the horizontal arrow can be misleading (e.g. pointing "ahead" for an ore that is 20 blocks directly below).
**Proposed:** Add a vertical indicator alongside the compass arrow — e.g. `↑` / `↓` / `—` based on `dy` vs a threshold.

---

### TODO-02 — Pickaxe tier selector needs in-game testing
**Priority:** Medium
`pickaxe_groups.js` defines four tiers. The "Iron, Gold & Copper only" group references `minecraft:copper_pickaxe` which may not exist in all Bedrock versions. Needs verification that all type IDs are valid and the dropdown saves/restores correctly across sessions.

---

### TODO-03 — Validation environment needs review after terrain changes
**Priority:** Low
`devValidation.js` flattens an 80×80 area at the player's current Y and places ores at `py+1`. If the player is at a Y level where the floor-fill (`py-1`) conflicts with bedrock or void, or where air-fill height of 6 is insufficient, the environment may look wrong. Should be tested at different Y levels (surface, underground, deep).

---

### TODO-04 — Incremental / delta scanning not yet implemented
**Priority:** Low (future optimisation)
Currently the full `dim.getBlocks(BlockVolume, { includeTypes })` scan is re-run every time the player moves beyond the rescan threshold. For large ore lists or busy servers this could be improved by only scanning the newly-entered slice of the bounding box (delta scan). Not causing issues at current `SCAN_RADIUS = 32` but worth revisiting if Watchdog warnings return.

---

### TODO-05 — SFTP deploy to server not yet configured
**Priority:** Medium (infrastructure)
`deploy_to_server.bat` generates `world_behavior_packs.json` correctly but the SFTP upload step is a stub comment. Needs server credentials, target path, and a chosen SFTP tool (e.g. `psftp`, `winscp /script`, or `scp`) wired in before the script is usable end-to-end.

---

### TODO-06 — Achievement-friendly status unverified
**Priority:** Low
Behavior packs that use scripting typically disable achievements in Bedrock worlds. OreDetector uses `@minecraft/server` scripting, so achievements are almost certainly disabled in any world it is active on. This should be documented clearly in the README / store listing so players are not surprised.

---

## Resolved Issues

| Version | Description |
|---------|-------------|
| 1.0.1 | Initial HUD — scanning ran every tick, causing 31 ms Watchdog warning |
| 1.0.2 | Fixed: scan cache added (position-driven) |
| 1.0.3 | Fixed: arrow direction wrong — `atan2(dx, -dz)` + `playerYaw + 180` North-origin conversion |
| 1.0.4 | Added: ore list sorted closest-first in HUD |
| 1.0.5 | Added: copper ore + raw block variants for gold/iron/copper |
| 1.0.6 | Added: full settings UI (per-ore toggles, debug dropdown) |
| 1.0.7 | Added: dynamic rescan threshold; pickaxe tier selector; `od:validation` dev command |
