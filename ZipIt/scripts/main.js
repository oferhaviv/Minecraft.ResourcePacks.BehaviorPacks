import { world, system, ItemStack } from "@minecraft/server";
import { PACKING_RULES }            from "./data/packing_rules.js";
import { CONFIG }                   from "./data/config.js";
import { logZI, getSettings, saveSettings, clearPlayerCache, cloneDefaultSettings } from "./settingsManager.js";
import { showMenuWithRetry,  clearPlayerMenuState } from "./ui/SettingsDialog.js";
import { resolveRuleEnabled } from "./data/ui_schema.js";
import registerValidation from "./devValidation.js"; // DEV ONLY – remove before publishing

const SCAN_INTERVAL_TICKS = 20;
const USAGE_MESSAGE = CONFIG.usageMessage;
const RULES = Array.isArray(PACKING_RULES) ? PACKING_RULES : [];

// Cache item-id validation because creating ItemStacks can be expensive (and may throw).
// itemId -> { ok: boolean, error?: string }
const itemIdValidationCache = new Map();
// BUG-12: cache max stack sizes — getMaxStackSize was creating a new ItemStack on every call.
const maxStackSizeCache = new Map(); // itemId → number
function validateItemId(itemId) {
  if (!itemId) return { ok: false, error: "Missing itemId" };
  if (itemIdValidationCache.has(itemId)) return itemIdValidationCache.get(itemId);

  try {
    new ItemStack(itemId, 1); // validate only; instance is discarded
    const result = { ok: true };
    itemIdValidationCache.set(itemId, result);
    return result;
  } catch (error) {
    const result = { ok: false, error: stringifyError(error) };
    itemIdValidationCache.set(itemId, result);
    return result;
  }
}

const disabledRuleIds = new Set();

// Debounce per-player to avoid multiple pack runs per tick burst.
const pendingPlayers = new Set();
let flushScheduled = false;

// BUG-07: ZipIt's own setItem calls re-trigger entityInventoryChange.
// Track the tick each player was last processed; skip re-processing within the cooldown window.
const lastProcessedTick = new Map(); // playerId → system.currentTick value
const PROCESS_COOLDOWN_TICKS = 5;

// ─── Script event commands ────────────────────────────────────────────────────
// /scriptevent zp:show -> shows the settings to player
// /scriptevent zp:active <true|false> -> allows the player to quickly enable/disable packing without opening the full menu
// /scriptevent zp:restore -> restores default settings for the player
// /scriptevent zp:validation -> DEV ONLY spawns a chest with packable items for testing rules
// /scriptevent zp:settings -> opens the simple settings menu
// /scriptevent zp:advance -> opens the full settings menu
// /scriptevent zp:usage or any zp: command -> shows a usage message to help users discover features without exposing the full debug menu.

if (system.afterEvents?.scriptEventReceive?.subscribe) {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    try {
      const source = ev.sourceEntity;
      if (!source || source.typeId !== "minecraft:player") return;

      const args = (ev.message ?? "").trim().split(/\s+/).filter((x) => x.length > 0);

      if (ev.id === "zp:show")           { handleZpShow(source);         return; } 
      if (ev.id === "zp:active")        { handleZpActive(source, args); return; }
      if (ev.id === "zp:restore")       { handleZpRestore(source);     return; }
      if (ev.id === "zp:validation")    { /* DEV ONLY – remove before publishing */
        if (getSettings(source)?.debug?.level !== "basic") {
          source.sendMessage("§c[ZipIt] Validation requires Debug Level set to Basic.");
          return;
        }
        registerValidation(source); return;
      }
      if (ev.id === "zp:settings") { showMenuWithRetry(source, RULES); return; }
      if (ev.id === "zp:advance") {  showMenuWithRetry(source, RULES, "advanced"); return; }
      if (ev.id.startsWith("zp:")) {
        //show usage message for any unrecognized "zp:" command to help users discover features without exposing the full debug menu.
        system.runTimeout(() => source.sendMessage(USAGE_MESSAGE), 2);
        return;
      }
    } catch (error) {
      logZI(`scriptEvent handler error: ${stringifyError(error)}`, "scriptEvent", true, true);
    }
  });
}

// ─── Command handlers ─────────────────────────────────────────────────────────

function handleZpShow(player) {
  try {
    const settings = getSettings(player);
    player.sendMessage(`ZipIt: enabled=${settings.enabled}`);
    for (const rule of RULES) {
      const resolved = resolveRuleSettings(settings, rule);
      player.sendMessage(
        ` - ${rule.id ?? rule.sourceItem}: enabled=${resolved.enabled} min=${resolved.minSourceCount}`
      );
    }
  } catch (error) {
    logZI(`handleZpShow: ${stringifyError(error)}`, "zp:get", true, true);
    player.sendMessage("ZipIt: failed to read settings. See log.");
  }
}


function handleZpActive(player, args) {
  try {
    if (!args || args.length < 1) { player.sendMessage(USAGE_MESSAGE); return; }
    const active = parseBool(args[0]);
    if (typeof active !== "boolean") { player.sendMessage(USAGE_MESSAGE); return; }

    const settings = getSettings(player);
    settings.enabled = active;
    if (!saveSettings(player, settings)) {
      player.sendMessage("ZipIt: failed to save settings.");
      return;
    }
    player.sendMessage(`ZipIt: active=${active}`);
  } catch (error) {
    logZI(`handleZpActive: ${stringifyError(error)}`, "zp:active", true, true);
    player.sendMessage("ZipIt: failed to update active flag. See log.");
  }
}

function handleZpRestore(player) {
  try {
    const settings = cloneDefaultSettings();
    if (!saveSettings(player, settings)) {
      player.sendMessage("ZipIt: restore failed (could not save settings).");
      return;
    }
    player.sendMessage("ZipIt: restored default settings.");
    logZI("restore -> defaults applied", "zp:restore");
  } catch (error) {
    logZI(`handleZpRestore: ${stringifyError(error)}`, "zp:restore", true, true);
    player.sendMessage("ZipIt: failed to restore settings. See log.");
  }
}

// ─── Inventory processing ─────────────────────────────────────────────────────

// Prefer event-driven inventory detection; fall back to polling interval.
if (world.afterEvents.entityInventoryChange?.subscribe) {
  world.afterEvents.entityInventoryChange.subscribe((ev) => {
    const entity = ev?.entity;
    if (!entity || entity.typeId !== "minecraft:player") return;
    schedulePlayerProcess(entity);
  });
} else {
  system.runInterval(() => {
    try {
      for (const player of world.getAllPlayers()) schedulePlayerProcess(player);
    } catch (error) {
      logZI(`runInterval error: ${stringifyError(error)}`, "interval", true, true);
    }
  }, SCAN_INTERVAL_TICKS);
}

if (world.afterEvents?.playerLeave?.subscribe) {
  world.afterEvents.playerLeave.subscribe((ev) => {
    clearPlayerCache(ev.playerId);
    clearPlayerMenuState(ev.playerId);
    lastProcessedTick.delete(ev.playerId);
    logZI(`cache cleared for player ${ev.playerId}`, "playerLeave");
  });
}

if (world.afterEvents?.playerJoin?.subscribe) {
  world.afterEvents.playerJoin.subscribe(() => {
    // BUG-11: by join time all addons are loaded. Clear previously failed item-id
    // validation entries so rules can recover if an addon that provides those items
    // loaded after ZipIt started.
    for (const [itemId, result] of itemIdValidationCache) {
      if (!result.ok) itemIdValidationCache.delete(itemId);
    }
    disabledRuleIds.clear();
  });
}

function schedulePlayerProcess(player) {
  try {
    if (!player) return;
    pendingPlayers.add(player);
    if (flushScheduled) return;
    flushScheduled = true;
    system.run(() => {
      flushScheduled = false;
      const toProcess = Array.from(pendingPlayers);
      pendingPlayers.clear();
      for (const p of toProcess) processPlayer(p);
    });
  } catch (error) {
    logZI(`schedulePlayerProcess: ${stringifyError(error)}`, "schedule", true, true);
  }
}

function processPlayer(player) {
  if (!player) return;
  try {
    // BUG-07: skip if we just processed this player — our own setItem calls re-fire the inventory event.
    const now  = system.currentTick;
    const last = lastProcessedTick.get(player.id) ?? -Infinity;
    if (now - last < PROCESS_COOLDOWN_TICKS) return;

    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container || !container.isValid) return;

    const playerSettings = getSettings(player);
    if (!playerSettings?.enabled) return;

    lastProcessedTick.set(player.id, now);

    let didPack = false;
    for (const rule of RULES) {
      const resolvedRuleSettings = resolveRuleSettings(playerSettings, rule);
      if (!resolvedRuleSettings.enabled) continue;
      if (tryExecutePackingRule(player, container, rule, resolvedRuleSettings)) didPack = true;
    }

    // Run consolidation whenever the feature is on — packing or not.
    // Gating on didPack meant consolidation was skipped when profiles were off
    // and the user only wanted stack merging, not packing.
    if (playerSettings.features?.inventorySort) {
      consolidateInventory(container);
    }
  } catch (error) {
    // BUG-06: player entity may be invalid (disconnected between queue and flush).
    logZI(`processPlayer: ${stringifyError(error)}`, "processPlayer", true, true);
  }
}

// ─── Packing rule execution ───────────────────────────────────────────────────

// Returns true if items were successfully packed, false if skipped or failed.
function tryExecutePackingRule(player, container, rule, ruleSettings) {
  const ruleKey = rule?.id ?? rule?.sourceItem ?? rule?.targetItem;
  if (ruleKey && disabledRuleIds.has(ruleKey)) return false;

  const sourceValidation = validateItemId(rule?.sourceItem);
  const targetValidation = validateItemId(rule?.targetItem);
  if (!sourceValidation?.ok || !targetValidation?.ok) {
    if (ruleKey) disabledRuleIds.add(ruleKey);
    logZI(
      `Skipping rule '${ruleKey}': invalid ItemStack typeId` +
      ` (source='${rule?.sourceItem}' err='${sourceValidation.error ?? ""}')`,
      "packRule", true, true
    );
    return false;
  }

  try {
    const sourceCount    = countItemInContainer(container, rule.sourceItem);
    const minSourceCount = ruleSettings.minSourceCount ?? rule.defaultMinSourceCount;

    if (sourceCount < minSourceCount) return false;
    if (sourceCount < rule.ratio)     return false;

    const packedCount = Math.floor(sourceCount / rule.ratio);
    if (packedCount <= 0) return false;

    const sourceToRemove = packedCount * rule.ratio;
    const targetCapacity = calculateTargetCapacity(container, rule.targetItem, rule.sourceItem, sourceToRemove);
    if (targetCapacity < packedCount) {
      logZI(
        `Rule '${ruleKey}': insufficient target capacity (need=${packedCount} have=${targetCapacity})`,
        "packRule", true
      );
      return false;
    }
    const removedAmount = removeItemsFromContainer(container, rule.sourceItem, sourceToRemove);

    if (removedAmount !== sourceToRemove) {
      logZI(
        `Rule '${ruleKey}': remove mismatch (expected=${sourceToRemove} removed=${removedAmount})`,
        "packRule", true, true
      );
      if (removedAmount > 0 && !placeItemsDeterministically(container, rule.sourceItem, removedAmount)) {
        logZI(`Rule '${ruleKey}': rollback failed — ${removedAmount}x ${rule.sourceItem} lost`, "packRule", true, true);
        player.sendMessage(`§c[ZipIt] Error: lost ${removedAmount}x ${rule.sourceItem} during packing. Please report this.`);
      }
      return false;
    }

    if (!placeItemsDeterministically(container, rule.targetItem, packedCount)) {
      logZI(`Rule '${ruleKey}': failed placing target items`, "packRule", true, true);
      if (!placeItemsDeterministically(container, rule.sourceItem, sourceToRemove)) {
        logZI(`Rule '${ruleKey}': rollback failed — ${sourceToRemove}x ${rule.sourceItem} lost`, "packRule", true, true);
        player.sendMessage(`§c[ZipIt] Error: lost ${sourceToRemove}x ${rule.sourceItem} during packing. Please report this.`);
      }
      return false;
    }

    return true; // packing completed successfully
  } catch (error) {
    logZI(`Rule '${ruleKey}': ${stringifyError(error)}`, "packRule", true, true);
    return false;
  }
}

function calculateTargetCapacity(container, targetItemId, sourceItemId, sourceToRemove) {
  const maxTargetStack = getMaxStackSize(targetItemId);
  let capacity = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item)                        { capacity += maxTargetStack; continue; }
    if (item.typeId === targetItemId)   capacity += Math.max(0, maxTargetStack - item.amount);
  }
  // Also count capacity from source slots that will be fully emptied by the planned removal.
  // Without this, packing silently fails when the only free space is currently occupied by source items.
  if (sourceItemId && sourceItemId !== targetItemId && sourceToRemove > 0) {
    let remaining = sourceToRemove;
    for (let slot = 0; slot < container.size && remaining > 0; slot++) {
      const item = container.getItem(slot);
      if (!item || item.typeId !== sourceItemId) continue;
      if (item.amount <= remaining) {
        capacity  += maxTargetStack; // this slot will be fully cleared
        remaining -= item.amount;
      } else {
        remaining = 0; // partial removal — slot stays occupied, no new empty slot
      }
    }
  }
  return capacity;
}

function getMaxStackSize(itemId) {
  if (maxStackSizeCache.has(itemId)) return maxStackSizeCache.get(itemId);
  let result = 64;
  try {
    const stack = new ItemStack(itemId, 1);
    const max   = stack?.maxAmount;
    if (typeof max === "number" && Number.isFinite(max) && max >= 1) result = Math.floor(max);
  } catch { /* fall through — return default 64 */ }
  maxStackSizeCache.set(itemId, result);
  return result;
}

function countItemInContainer(container, itemId) {
  let total = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId === itemId) total += item.amount;
  }
  return total;
}

function removeItemsFromContainer(container, itemId, amountToRemove) {
  let remaining = amountToRemove;
  let removed   = 0;
  for (let slot = 0; slot < container.size; slot++) {
    if (remaining <= 0) break;
    const item = container.getItem(slot);
    if (!item || item.typeId !== itemId) continue;
    if (item.amount <= remaining) {
      removed   += item.amount;
      remaining -= item.amount;
      container.setItem(slot, undefined);
    } else {
      container.setItem(slot, new ItemStack(itemId, item.amount - remaining));
      removed   += remaining;
      remaining  = 0;
    }
  }
  return removed;
}

/**
 * Deterministic placement: fill existing stacks first, then use empty slots.
 * Returns false if not all items could be placed.
 */
function placeItemsDeterministically(container, itemId, totalAmount) {
  let remaining    = totalAmount;
  const maxStack   = getMaxStackSize(itemId);

  // Phase 1: top up existing stacks
  for (let slot = 0; slot < container.size && remaining > 0; slot++) {
    const item = container.getItem(slot);
    if (!item || item.typeId !== itemId || item.amount >= maxStack) continue;
    const toAdd = Math.min(maxStack - item.amount, remaining);
    container.setItem(slot, new ItemStack(itemId, item.amount + toAdd));
    remaining -= toAdd;
  }

  // Phase 2: fill empty slots
  for (let slot = 0; slot < container.size && remaining > 0; slot++) {
    if (container.getItem(slot)) continue;
    const toPlace = Math.min(maxStack, remaining);
    container.setItem(slot, new ItemStack(itemId, toPlace));
    remaining -= toPlace;
  }

  return remaining === 0;
}

// ─── Inventory consolidation ──────────────────────────────────────────────────

/**
 * Merges partial stacks of the same item typeId in-place.
 * Fills the slot with the highest existing count first, then overflows to the next.
 * Skips named, enchanted, or lore-bearing items (non-plain stacks).
 * Does NOT reorder slots — only writes slots whose amount changes.
 * Only called when packing actually happened this tick (BUG-08).
 */
function consolidateInventory(container) {
  // Group plain stackable items by typeId, recording their slot.
  const groups = new Map(); // typeId → [{slot, amount}]
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item) continue;
    const maxStack = getMaxStackSize(item.typeId);
    if (maxStack <= 1) continue; // non-stackable
    // Skip non-plain items.
    if (item.nameTag !== undefined) continue;
    try {
      const lore = item.getLore?.();
      if (lore && lore.length > 0) continue;
      const enc = item.getComponent?.("minecraft:enchantable");
      if (enc?.getEnchantments?.()?.length > 0) continue;
    } catch { /* treat as plain */ }
    if (!groups.has(item.typeId)) groups.set(item.typeId, []);
    groups.get(item.typeId).push({ slot, amount: item.amount });
  }

  for (const [typeId, entries] of groups) {
    if (entries.length <= 1) continue;
    const maxStack = getMaxStackSize(typeId);
    // Skip if every slot is already full — nothing to merge.
    if (entries.every((e) => e.amount >= maxStack)) continue;

    const total = entries.reduce((sum, e) => sum + e.amount, 0);
    // Sort descending so the fullest slot absorbs first, preserving its position priority.
    entries.sort((a, b) => b.amount - a.amount);

    let remaining = total;
    for (const { slot } of entries) {
      if (remaining <= 0) {
        container.setItem(slot, undefined);
      } else {
        const toPlace = Math.min(remaining, maxStack);
        container.setItem(slot, new ItemStack(typeId, toPlace));
        remaining -= toPlace;
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveRuleSettings(playerSettings, rule) {
  // BUG-09: use the canonical resolveRuleEnabled from ui_schema.js instead of a local duplicate.
  return {
    enabled:        resolveRuleEnabled(playerSettings, rule),
    minSourceCount: playerSettings?.rules?.[rule.id]?.minSourceCount ?? rule.defaultMinSourceCount ?? rule.ratio,
  };
}


function parseBool(value) {
  if (value == null) return undefined;
  const v = String(value).trim().toLowerCase();
  if (v === "true"  || v === "1" || v === "on"  || v === "yes") return true;
  if (v === "false" || v === "0" || v === "off" || v === "no")  return false;
  return undefined;
}

function stringifyError(error) {
  try {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  } catch { return "Unknown error"; }
}
