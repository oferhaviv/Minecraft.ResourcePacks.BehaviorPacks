import { world, system, ItemStack } from "@minecraft/server";
import { PACKING_RULES }            from "./data/packing_rules.js";
import { CONFIG }                   from "./data/config.js";
import { logZI, getSettings, saveSettings, clearPlayerCache, cloneDefaultSettings } from "./settingsManager.js";
import { showMenuWithRetry, clearPlayerMenuState } from "./ui/SettingsDialog.js";
import registerValidation from "./devValidation.js"; // DEV ONLY – remove before publishing

const SCAN_INTERVAL_TICKS = 20;
const USAGE_MESSAGE = CONFIG.usageMessage;
const RULES = Array.isArray(PACKING_RULES) ? PACKING_RULES : [];

// Cache item-id validation because creating ItemStacks can be expensive (and may throw).
// itemId -> { ok: boolean, error?: string }
const itemIdValidationCache = new Map();
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

// ─── Script event commands ────────────────────────────────────────────────────
// /scriptevent zp:get
// /scriptevent zp:set <ruleIdOrItemId> <true|false>
// /scriptevent zp:active <true|false>
// /scriptevent zp:debugLevel <0-1>
// /scriptevent zp:restore
// /scriptevent zp:settings  (alias: zp:showSettings)
// /scriptevent zp:usage

if (system.afterEvents?.scriptEventReceive?.subscribe) {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    try {
      const source = ev.sourceEntity;
      if (!source || source.typeId !== "minecraft:player") return;

      const args = (ev.message ?? "").trim().split(/\s+/).filter((x) => x.length > 0);

      if (ev.id === "zp:get")           { handleZpGet(source);         return; }
      if (ev.id === "zp:set")           { handleZpSet(source, args);   return; }
      if (ev.id === "zp:active")        { handleZpActive(source, args); return; }
      if (ev.id === "zp:debugLevel")    { handleZpDebugLevel(source, args); return; }
      if (ev.id === "zp:restore")       { handleZpRestore(source);     return; }
      if (ev.id === "zp:validation")    { /* DEV ONLY – remove before publishing */ registerValidation(source); return; }
      if (ev.id === "zp:showSettings" || ev.id === "zp:settings") {
        showMenuWithRetry(source, RULES);
        return;
      }
      if (ev.id === "zp:usage") {
        system.runTimeout(() => source.sendMessage(USAGE_MESSAGE), 2);
        return;
      }
    } catch (error) {
      logZI(`scriptEvent handler error: ${stringifyError(error)}`, "scriptEvent", true, true);
    }
  });
}

// ─── Command handlers ─────────────────────────────────────────────────────────

function handleZpGet(player) {
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
    logZI(`handleZpGet: ${stringifyError(error)}`, "zp:get", true, true);
    player.sendMessage("ZipIt: failed to read settings. See log.");
  }
}

function handleZpSet(player, args) {
  if (!args || args.length < 2) { player.sendMessage(USAGE_MESSAGE); return; }

  const key      = args[0];
  const valueRaw = args[1].toLowerCase();
  const value    = valueRaw === "true" || valueRaw === "1" || valueRaw === "on";

  const rule = findRuleByKey(key);
  if (!rule) { player.sendMessage(`ZipIt: unknown item/rule '${key}'.`); return; }

  try {
    const settings = getSettings(player);
    if (!settings.rules)         settings.rules = {};
    if (!settings.rules[rule.id]) settings.rules[rule.id] = {};
    settings.rules[rule.id].enabled = value;

    if (!saveSettings(player, settings)) {
      player.sendMessage("ZipIt: failed to save settings.");
      return;
    }
    const msg = `rule '${rule.id}' (${rule.sourceItem}) set to enabled=${value}.`;
    logZI(msg, "zp:set");
    player.sendMessage(`ZipIt: ${msg}`);
  } catch (error) {
    logZI(`handleZpSet: ${stringifyError(error)}`, "zp:set", true, true);
    player.sendMessage("ZipIt: failed to update settings. See log.");
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

function handleZpDebugLevel(player, args) {
  try {
    if (!args || args.length < 1) { player.sendMessage(USAGE_MESSAGE); return; }
    const n = Number(String(args[0]).trim());
    if (!Number.isFinite(n)) { player.sendMessage(USAGE_MESSAGE); return; }

    const settings = getSettings(player);
    settings.debug = settings.debug ?? {};
    settings.debug.level = n <= 0 ? "none" : "basic";

    if (!saveSettings(player, settings)) {
      player.sendMessage("ZipIt: failed to save settings.");
      return;
    }
    player.sendMessage(`ZipIt: debugLevel=${settings.debug.level}`);
    logZI(`debugLevel set to ${settings.debug.level}`, "zp:debugLevel");
  } catch (error) {
    logZI(`handleZpDebugLevel: ${stringifyError(error)}`, "zp:debugLevel", true, true);
    player.sendMessage("ZipIt: failed to update debug level. See log.");
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
    logZI(`cache cleared for player ${ev.playerId}`, "playerLeave");
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
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container || !container.isValid) return;

  const playerSettings = getSettings(player);
  if (!playerSettings?.enabled) return;

  for (const rule of RULES) {
    const resolvedRuleSettings = resolveRuleSettings(playerSettings, rule);
    if (!resolvedRuleSettings.enabled) continue;
    tryExecutePackingRule(container, rule, resolvedRuleSettings);
  }
}

// ─── Packing rule execution ───────────────────────────────────────────────────

function tryExecutePackingRule(container, rule, ruleSettings) {
  const ruleKey = rule?.id ?? rule?.sourceItem ?? rule?.targetItem;
  if (ruleKey && disabledRuleIds.has(ruleKey)) return;

  const sourceValidation = validateItemId(rule?.sourceItem);
  const targetValidation = validateItemId(rule?.targetItem);
  if (!sourceValidation?.ok || !targetValidation?.ok) {
    if (ruleKey) disabledRuleIds.add(ruleKey);
    logZI(
      `Skipping rule '${ruleKey}': invalid ItemStack typeId` +
      ` (source='${rule?.sourceItem}' err='${sourceValidation.error ?? ""}')`,
      "packRule", true, true
    );
    return;
  }

  try {
    const sourceCount    = countItemInContainer(container, rule.sourceItem);
    const minSourceCount = ruleSettings.minSourceCount ?? rule.defaultMinSourceCount;

    if (sourceCount < minSourceCount) return;
    if (sourceCount < rule.ratio)     return;

    const packedCount = Math.floor(sourceCount / rule.ratio);
    if (packedCount <= 0) return;

    const targetCapacity = calculateTargetCapacity(container, rule.targetItem);
    if (targetCapacity < packedCount) {
      logZI(
        `Rule '${ruleKey}': insufficient target capacity (need=${packedCount} have=${targetCapacity})`,
        "packRule", true
      );
      return;
    }

    const sourceToRemove = packedCount * rule.ratio;
    const removedAmount  = removeItemsFromContainer(container, rule.sourceItem, sourceToRemove);

    if (removedAmount !== sourceToRemove) {
      logZI(
        `Rule '${ruleKey}': remove mismatch (expected=${sourceToRemove} removed=${removedAmount})`,
        "packRule", true, true
      );
      if (removedAmount > 0 && !placeItemsDeterministically(container, rule.sourceItem, removedAmount)) {
        logZI(`Rule '${ruleKey}': rollback failed`, "packRule", true, true);
      }
      return;
    }

    if (!placeItemsDeterministically(container, rule.targetItem, packedCount)) {
      logZI(`Rule '${ruleKey}': failed placing target items`, "packRule", true, true);
      if (!placeItemsDeterministically(container, rule.sourceItem, sourceToRemove)) {
        logZI(`Rule '${ruleKey}': rollback failed`, "packRule", true, true);
      }
    }
  } catch (error) {
    logZI(`Rule '${ruleKey}': ${stringifyError(error)}`, "packRule", true, true);
  }
}

function calculateTargetCapacity(container, targetItemId) {
  const maxStackSize = getMaxStackSize(targetItemId);
  let capacity = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item)                       { capacity += maxStackSize; continue; }
    if (item.typeId === targetItemId)  capacity += Math.max(0, maxStackSize - item.amount);
  }
  return capacity;
}

function getMaxStackSize(itemId) {
  try {
    const stack = new ItemStack(itemId, 1);
    const max   = stack?.maxAmount;
    if (typeof max === "number" && Number.isFinite(max) && max >= 1) return Math.floor(max);
  } catch { /* fall through */ }
  return 64;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveRuleSettings(playerSettings, rule) {
  const playerRuleSettings = playerSettings?.rules?.[rule.id];
  const ruleProfiles       = Array.isArray(rule?.profile) ? rule.profile : [];
  const profileEnabled     = ruleProfiles.length > 0
    ? ruleProfiles.some((p) => playerSettings?.profiles?.[p] === true)
    : rule.enabledByDefault ?? true;

  return {
    enabled: typeof playerRuleSettings?.enabled === "boolean"
      ? playerRuleSettings.enabled
      : profileEnabled,
    minSourceCount: playerRuleSettings?.minSourceCount ?? rule.defaultMinSourceCount ?? rule.ratio,
  };
}

function findRuleByKey(key) {
  const lk = key.toLowerCase();
  return RULES.find(r =>
    (r.id         && String(r.id).toLowerCase()         === lk) ||
    (r.sourceItem && String(r.sourceItem).toLowerCase() === lk)
  );
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
