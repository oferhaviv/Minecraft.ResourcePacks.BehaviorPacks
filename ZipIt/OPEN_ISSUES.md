# ZipIt – Open Issues

Bug review targeting crashes, data loss, and broken core features for multiplayer server readiness.
Files excluded from review: `devValidation.js`.

Status legend: `Open` | `In Progress` | `Fixed` | `Won't Fix`

---

## CRITICAL — Data loss / crashes

### BUG-01 · `calculateTargetCapacity` ignores slots freed by source removal
**File:** `scripts/main.js` → `calculateTargetCapacity()`
**Status:** Fixed — v1.0.2

Capacity is calculated on the **current** container state, before source items are removed.
When the player's inventory is full and the only available space is currently occupied by source items,
capacity returns 0 and packing is skipped — even though removing the source items would free exactly
the slots needed.

**Reproduction:** Fill all 36 inventory slots. Put exactly 9 iron ingots in one slot, other items in the
rest. → Iron ingots never pack into an iron block. The slot freed by removing 9 ingots is never counted
as available capacity for the 1 iron block.

**Impact:** Core packing feature silently fails for players with a full inventory. Very common in survival
multiplayer.

**Fix direction:** When computing target capacity, also add capacity for the slots that the planned
source removal will fully empty. A simple approach: after the `packedCount` and `sourceToRemove` are
known, count source slots that will become fully empty and add `emptySlots × maxTargetStack` to
the capacity total.

---

### BUG-02 · ~~`container.isValid` is a method, not a property~~
**File:** `scripts/main.js` → `processPlayer()`
**Status:** Won't Fix — misdiagnosed

`Container.isValid` is a **property** (not a method) in `@minecraft/server` 2.5.0.
Calling it as `isValid()` throws `TypeError: not a function` at runtime (confirmed in-game).
The original code `container.isValid` was correct. The v1.0.2 change to `isValid()` was reverted.

---

### BUG-03 · Item loss when partial removal rollback fails
**File:** `scripts/main.js` → `tryExecutePackingRule()`
**Status:** Fixed — v1.0.3

If `removeItemsFromContainer` returns fewer items than expected (`removedAmount !== sourceToRemove`),
the code attempts a rollback via `placeItemsDeterministically`. If that rollback also fails (inventory
somehow full from a concurrent rule running earlier in the same flush), the removed items are **silently
discarded** — only a `logZI` warning is emitted.

**Impact:** Permanent item loss. Rare but catastrophic when it occurs; no in-game feedback to the player.

**Fix direction:** On rollback failure, always send the player a visible chat message with the lost item
type and count. Consider also dropping the items at the player's feet as a last resort recovery.

---

### BUG-04 · `_runMenuChain` retries on a player who has already left
**File:** `scripts/ui/SettingsDialog.js` → `_runMenuChain()`
**Status:** Fixed — v1.0.3

When the UI is retried after a `UserBusy` cancellation, a `system.runTimeout` schedules the next
attempt. If the player disconnects during the wait, the timeout still fires and calls
`getSettings(player)` and `form.show(player)` on an **invalid player entity**, which will throw.

The `.catch(e)` at the bottom does handle the error and clears `openMenuPlayers`, but the `getSettings`
call happens *before* `form.show`, outside the promise chain — its throw is not caught by `.catch`.

**Impact:** Script exception on player leave during UI retry; in a try/catch context this is
non-fatal but it's avoidable.

**Fix:** Add `if (!player.isValid?.()) { openMenuPlayers.delete(player.id); return; }` at the top of
`_runMenuChain`.

---

## HIGH — Broken reliability / multiplayer correctness

### BUG-05 · `openMenuPlayers` never cleared if `getSettings` throws in `_runMenuChain`
**File:** `scripts/ui/SettingsDialog.js` → `_runMenuChain()`
**Status:** Fixed — v1.0.3

`getSettings(player)` is called at the top of `_runMenuChain` without a try/catch. If it throws
(e.g., corrupt dynamic property data), the function exits immediately without calling
`openMenuPlayers.delete(player.id)`. The player is **permanently locked out** of the settings UI for
the rest of the session.

**Impact:** Players on a multiplayer server with corrupt settings data cannot open ZipIt settings at all
until they reconnect.

**Fix:** Wrap the body of `_runMenuChain` in try/catch, and call `openMenuPlayers.delete(player.id)` in
the catch block before re-throwing or logging.

---

### BUG-06 · `processPlayer` does not validate the player entity before operating
**File:** `scripts/main.js` → `processPlayer()`
**Status:** Fixed — v1.0.3

Players are added to `pendingPlayers` in the `entityInventoryChange` handler and then processed on the
next microtask via `system.run`. If a player disconnects between being queued and being flushed, the
player reference is stale. The function checks `if (!player)` but not `player.isValid()`.

**Impact:** `player.getComponent(...)` on an invalid entity may throw, leaking into the catch-all only
if the call is inside a try/catch — but `getComponent` is called before any try/catch here.

**Fix:** `if (!player || !player.isValid?.()) return;` at the top of `processPlayer`.

---

### BUG-07 · ZipIt's own `setItem` calls re-trigger `entityInventoryChange`, causing a processing loop
**File:** `scripts/main.js` — inventory subscription + `tryExecutePackingRule`
**Status:** Fixed — v1.0.3

Every `container.setItem(...)` call inside `tryExecutePackingRule` fires `entityInventoryChange` for
that player. This queues the player again in `pendingPlayers` and schedules another `system.run` flush.
The loop terminates only when no rule qualifies anymore, but on every intermediate tick ZipIt re-scans
the full inventory and re-evaluates all rules.

**Impact on multiplayer:** With cascade-eligible rules (e.g. `copper_nugget → copper_ingot → copper_block`)
and large item counts, a single pickup can spawn 2–3 consecutive processing ticks per player. With many
active players this compounds. No functional breakage, but measurable wasted CPU per tick.

**Fix direction:** Track a per-player `isProcessing` flag; skip `schedulePlayerProcess` while a flush
is already executing for that player. Clear the flag after `processPlayer` returns.

---

## MEDIUM — Edge cases / correctness

### BUG-08 · `inventorySort` feature is toggled in UI and settings but never implemented
**Files:** `scripts/data/default_player_settings.js`, `scripts/data/ui_schema.js`, `scripts/main.js`
**Status:** Fixed — v1.0.4

`features.inventorySort` exists in the default settings, is shown as a toggle in the settings form,
and is persisted correctly. However, `processPlayer` never reads this flag and there is no sort logic
anywhere in the codebase.

**Impact:** Players enable "Inventory Sort" and nothing happens. Silent broken feature.

**Fix:** Either implement sort logic in `processPlayer` (after packing) or remove the setting and UI
toggle until it's ready.

---

### BUG-09 · `resolveRuleSettings` (main.js) and `resolveRuleEnabled` (ui_schema.js) duplicate the same logic
**Files:** `scripts/main.js` → `resolveRuleSettings()`, `scripts/data/ui_schema.js` → `resolveRuleEnabled()`
**Status:** Fixed — v1.0.4

Both functions compute the effective enabled state for a rule (explicit player override → profile
default → rule default). They are independent implementations. If the resolution logic changes in one
place, the UI and the actual packing engine will disagree silently — the player sees one thing in the
settings form and ZipIt does another.

**Impact:** Logic drift between UI display and actual behavior. Hard to notice until a player reports
"I disabled rule X but it's still running."

**Fix direction:** Export a single `resolveRuleEnabled(settings, rule)` from one canonical location
(e.g., `ui_schema.js` already has it) and import it into `main.js` instead of reimplementing.

---

### BUG-10 · `saveSettings` in the store caches a mutable reference
**File:** `shared/playerSettingsStore.js` → `saveSettings()`
**Status:** Fixed — v1.0.4

```js
cache.set(player.id, settings); // stores the caller's object directly
```

The caller retains a reference to the same object. A future bug in any caller that mutates `settings`
after saving will silently corrupt the in-memory cache without touching the persisted dynamic property.
`getSettings` does clone on read, so current callers happen to be safe, but the contract is fragile.

**Fix:** `cache.set(player.id, JSON.parse(JSON.stringify(settings)));`

---

## LOW — Minor / improvements

### BUG-11 · `disabledRuleIds` blacklist has no recovery path
**File:** `scripts/main.js` → `tryExecutePackingRule()` / `validateItemId()`
**Status:** Fixed — v1.0.4

If a rule's `sourceItem` or `targetItem` fails `ItemStack` validation on first use, the rule ID is
added to `disabledRuleIds` permanently for the session. If the item becomes available later in the same
session (another addon loads after ZipIt, or a world flag enables it), the rule stays disabled until
server restart.

**Fix:** Log the invalid rule on startup rather than lazily; or periodically retry validation (e.g., on
`playerJoin`) and remove from `disabledRuleIds` if it now passes.

---

### BUG-12 · `getMaxStackSize` creates a new `ItemStack` on every call without caching
**File:** `scripts/main.js` → `getMaxStackSize()`
**Status:** Fixed — v1.0.4

`ItemStack` construction is noted in the code as expensive. `getMaxStackSize` is called once per rule
per `calculateTargetCapacity` call, which runs every processing tick for every player. The result never
changes for a given item ID.

**Fix:** Add stack-size results to the existing `itemIdValidationCache` map (or a separate
`maxStackSizeCache`) after first lookup.

---

### BUG-13 · `minSourceCount` is in the schema and merge logic but unreachable by players
**File:** `scripts/main.js` → `handleZpSet()`, `shared/playerSettingsStore.js` → `mergeSettings()`
**Status:** Won't Fix — by design

The power-user commands (`zp:get`, `zp:set`, `zp:debugLevel`) were intentionally removed in favour
of the `zp:advance` settings UI. `minSourceCount` could be added as a numeric input to the advanced
menu, but that is a feature addition, not a bug fix. Field remains functional in the engine for future
use.

---

## Summary Table

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| BUG-01 | Critical | main.js | Target capacity ignores freed source slots → packing skips on full inventory | Fixed v1.0.2 |
| BUG-02 | Critical | main.js | ~~`container.isValid` not called as method~~ — misdiagnosed, `isValid` IS a property in 2.5.0; revert applied | Won't Fix |
| BUG-03 | Critical | main.js | Rollback failure silently loses items | Fixed v1.0.3 |
| BUG-04 | Critical | SettingsDialog.js | Menu retry fires on disconnected player entity | Fixed v1.0.3 |
| BUG-05 | High | SettingsDialog.js | `getSettings` throw leaves player stuck in `openMenuPlayers` | Fixed v1.0.3 |
| BUG-06 | High | main.js | `processPlayer` uses stale player reference without `isValid()` check | Fixed v1.0.3 |
| BUG-07 | High | main.js | Own `setItem` calls re-trigger inventory event → processing loop | Fixed v1.0.3 |
| BUG-08 | Medium | multiple | `inventorySort` feature toggle exists but is never implemented | Fixed v1.0.4 |
| BUG-09 | Medium | main.js + ui_schema.js | Rule enabled resolution logic duplicated; can silently diverge | Fixed v1.0.4 |
| BUG-10 | Medium | playerSettingsStore.js | `saveSettings` caches mutable reference | Fixed v1.0.4 |
| BUG-11 | Low | main.js | `disabledRuleIds` blacklist permanent for session; no recovery | Fixed v1.0.4 |
| BUG-12 | Low | main.js | `getMaxStackSize` not cached; creates ItemStack every call | Fixed v1.0.4 |
| BUG-13 | Low | main.js | `minSourceCount` per-rule setting unreachable via commands or UI | Won't Fix |
