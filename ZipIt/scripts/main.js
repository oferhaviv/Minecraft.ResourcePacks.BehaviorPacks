import { world, system, ItemStack } from "@minecraft/server";
import { PACKING_RULES } from "./data/packing_rules";
import { DEFAULT_PLAYER_SETTINGS } from "./data/default_player_settings";
import { CONFIG } from "./data/config";
import { myLog } from "./myLog.js";
import { createZpSettingsDialogHandlers } from "./ui/SettingsDialog.js";

const SCAN_INTERVAL_TICKS = 20;
const PLAYER_SETTINGS_PROPERTY_KEY = "zipit:settings";
const USE_DYNAMIC_PLAYER_SETTINGS = true;
const DYNAMIC_SETTINGS_MAX_BYTES = 8192;

const USAGE_MESSAGE = CONFIG.usageMessage;
const RULES = Array.isArray(PACKING_RULES) ? PACKING_RULES : [];
// Make debug settings visible to `scripts/myLog.js` via `globalThis`.
globalThis.GLOBAL_SETTINGS = globalThis.GLOBAL_SETTINGS ?? { debugLevelIndex: 1 };

const { handleZpShowSettings } = createZpSettingsDialogHandlers({
  RULES,
  getPlayerSettings,
  savePlayerSettings,
  myLog,
});

// Cache item-id validation because creating ItemStacks can be expensive (and may throw).
// itemId -> { ok: boolean, error?: string }
const itemIdValidationCache = new Map();
function validateItemId(itemId) {
  if (!itemId) return { ok: false, error: "Missing itemId" };
  if (itemIdValidationCache.has(itemId)) return itemIdValidationCache.get(itemId);

  try {
    // Only validate; do not keep the instance.
    // eslint-disable-next-line no-new
    new ItemStack(itemId, 1);
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

world.afterEvents.worldInitialize?.subscribe((ev) => {
  try {
    // Register per-player dynamic property for settings storage.
    ev.propertyRegistry.registerEntityTypeDynamicProperties(
      {
        [PLAYER_SETTINGS_PROPERTY_KEY]: {
          type: "string",
          maxLength: DYNAMIC_SETTINGS_MAX_BYTES,
        },
      },
      "minecraft:player"
    );
  } catch (error) {
    myLog(
      `Dynamic property registration failed: ${stringifyError(error)}`,
      "ZipIt",
      true
    );
  }
});

// Script event–based command handler for ZipIt:
// /scriptevent zp:get
// /scriptevent zp:set <ruleIdOrItemId> <true|false>
// /scriptevent zp:usage
// /scriptevent zp:debugLevel <0-1>
// /scriptevent zp:active <true|false>
// /scriptevent zp:restore
// /scriptevent zp:showSettings
if (system.afterEvents?.scriptEventReceive?.subscribe) {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    try {
      const source = ev.sourceEntity;
      if (!source || source.typeId !== "minecraft:player") return;

      const args = (ev.message ?? "").trim().split(/\s+/).filter((x) => x.length > 0);
      
      if (ev.id === "zp:get") {
        handleZpGet(source);
        return;
      }

      if (ev.id === "zp:usage") {
        system.runTimeout(() => ev.sourceEntity.sendMessage(USAGE_MESSAGE), 2);
        return;
      }

      if (ev.id === "zp:set") {
        handleZpSet(source, args);
        return;
      }
      if (ev.id === "zp:active") {
        handleZpActive(source, args);
        return;
      }
      if (ev.id === "zp:debugLevel") {
        handleZpDebugLevel(source, args);
        return;
      }
      if (ev.id === "zp:restore") {
        handleZpRestore(source);
        return;
      }
      if (ev.id === "zp:showSettings" || ev.id === "zp:settings") {
        handleZpShowSettings(source);
        return;
      }
    } catch (error) {
      myLog(`scriptEvent handler error: ${stringifyError(error)}`, "ZipIt", true);
    }
  });
}

function handleZpGet(player) {
  try {
    const settings = getPlayerSettings(player);
    player.sendMessage(`ZipIt: enabled=${settings.enabled}`);

    for (const rule of RULES) {
      const resolved = resolveRuleSettings(settings, rule);
      player.sendMessage(
        ` - ${rule.id ?? rule.sourceItem}: enabled=${resolved.enabled} min=${resolved.minSourceCount}`
      );
    }
  } catch (error) {
    myLog(`Failed /zp get: ${stringifyError(error)}`, "ZipIt", true);
    player.sendMessage("ZipIt: failed to read settings. See log.");
  }
}

function findRuleByKey(key) {
  const lowerKey = key.toLowerCase();

  for (const rule of RULES) {
    if (rule.id && String(rule.id).toLowerCase() === lowerKey) return rule;
    if (rule.sourceItem && String(rule.sourceItem).toLowerCase() === lowerKey) return rule;
  }

  return undefined;
}

function handleZpSet(player, args) {
  if (!args || args.length < 2) {
    player.sendMessage(USAGE_MESSAGE);
    return;
  }

  const key = args[0];
  const valueRaw = args[1].toLowerCase();
  const value = valueRaw === "true" || valueRaw === "1" || valueRaw === "on";

  const rule = findRuleByKey(key);
  if (!rule) {
    player.sendMessage(`ZipIt: unknown item/rule '${key}'.`);
    return;
  }

  try {
    const settings = getPlayerSettings(player);
    if (!settings.rules) settings.rules = {};
    if (!settings.rules[rule.id]) settings.rules[rule.id] = {};

    settings.rules[rule.id].enabled = value;

    const saved = savePlayerSettings(player, settings);
    if (!saved) {
      player.sendMessage("ZipIt: failed to save settings (too large or error).");
      return;
    }
    const message = `rule '${rule.id}' (${rule.sourceItem}) set to enabled=${value}.`;
    myLog(message, "handleZpSet");
    player.sendMessage(`ZipIt: ${message}`);
  } catch (error) {
    myLog(`Failed zipit:set: ${stringifyError(error)}`, "ZipIt", true);
    player.sendMessage("ZipIt: failed to update settings. See log.");
  }
}

function parseBool(value) {
  if (value == null) return undefined;
  const v = String(value).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "on" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  return undefined;
}

function handleZpActive(player, args) {
  try {
    if (!args || args.length < 1) {
      player.sendMessage(USAGE_MESSAGE);
      return;
    }

    const active = parseBool(args[0]);
    if (typeof active !== "boolean") {
      player.sendMessage(USAGE_MESSAGE);
      return;
    }

    const settings = getPlayerSettings(player);
    settings.enabled = active;
    const saved = savePlayerSettings(player, settings);

    if (!saved) {
      player.sendMessage("ZipIt: failed to save settings.");
      return;
    }

    player.sendMessage(`ZipIt: active=${active}`);
  } catch (error) {
    myLog(`Failed zipit:active: ${stringifyError(error)}`, "ZipIt", true);
    player.sendMessage("ZipIt: failed to update active flag. See log.");
  }
}

function handleZpDebugLevel(player, args) {
  try {
    if (!args || args.length < 1) {
      player.sendMessage(USAGE_MESSAGE);
      return;
    }

    const raw = String(args[0]).trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      player.sendMessage(USAGE_MESSAGE);
      return;
    }

    const level = n <= 0 ? 0 : 1;
    globalThis.GLOBAL_SETTINGS = globalThis.GLOBAL_SETTINGS ?? { debugLevelIndex: 0 };
    globalThis.GLOBAL_SETTINGS.debugLevelIndex = level;

    // Persist into player settings so the dialog stays consistent.
    const settings = getPlayerSettings(player);
    settings.debug = settings.debug ?? {};
    settings.debug.level = level === 1 ? "basic" : "none";
    savePlayerSettings(player, settings);

    player.sendMessage(`ZipIt: debugLevelIndex=${level}`);
    myLog(`debugLevelIndex set to ${level}`, "ZipIt");
  } catch (error) {
    myLog(`Failed zipit:debugLevel: ${stringifyError(error)}`, "ZipIt", true);
    player.sendMessage("ZipIt: failed to update debug level. See log.");
  }
}

function handleZpRestore(player) {
  try {
    const settings = deepClone(DEFAULT_PLAYER_SETTINGS);
    const saved = savePlayerSettings(player, settings);

    if (!saved) {
      player.sendMessage("ZipIt: restore failed (could not save settings).");
      return;
    }

    player.sendMessage("ZipIt: restored default settings.");
    syncGlobalDebugFromSettings(settings);
    myLog("restore -> defaults applied", "ZipIt");
  } catch (error) {
    myLog(`Failed zipit:restore: ${stringifyError(error)}`, "ZipIt", true);
    player.sendMessage("ZipIt: failed to restore settings. See log.");
  }
}

function getDebugLevelIndexFromLevel(level) {
  return level === "basic" ? 1 : 0;
}

function syncGlobalDebugFromSettings(settings) {
  const level = settings?.debug?.level ?? "none";
  globalThis.GLOBAL_SETTINGS = globalThis.GLOBAL_SETTINGS ?? { debugLevelIndex: 0 };
  globalThis.GLOBAL_SETTINGS.debugLevelIndex = getDebugLevelIndexFromLevel(level);
}

// Prefer event-driven inventory detection when available; keep interval as fallback.
if (world.afterEvents.entityInventoryChange?.subscribe) {
  world.afterEvents.entityInventoryChange.subscribe((ev) => {
    const entity = ev?.entity;
    if (!entity || entity.typeId !== "minecraft:player") return;
    schedulePlayerProcess(entity);
  });
} else {
  system.runInterval(() => {
    try {
      const players = world.getAllPlayers();
      for (const player of players) {
        schedulePlayerProcess(player);
      }
    } catch (error) {
      myLog(`Main loop error: ${stringifyError(error)}`, "ZipIt", true);
    }
  }, SCAN_INTERVAL_TICKS);
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
    myLog(`Scheduling error: ${stringifyError(error)}`, "ZipIt", true);
  }
}

function processPlayer(player) {
  if (!player) return;

  const inventoryComponent = player.getComponent("minecraft:inventory");
  const container = inventoryComponent?.container;

  if (!container || !container.isValid) return;

  const playerSettings = getPlayerSettings(player);
  if (!playerSettings?.enabled) return;

  for (const rule of RULES) {
    const resolvedRuleSettings = resolveRuleSettings(playerSettings, rule);

    if (!resolvedRuleSettings.enabled) continue;

    tryExecutePackingRule(container, rule, resolvedRuleSettings);
  }
}

function tryExecutePackingRule(container, rule, ruleSettings) {
  const ruleKey = rule?.id ?? rule?.sourceItem ?? rule?.targetItem;
  if (ruleKey && disabledRuleIds.has(ruleKey)) return;

  // Validate item ids up-front; if invalid, skip without modifying inventory.
  const sourceValidation = validateItemId(rule?.sourceItem);
  const targetValidation = validateItemId(rule?.targetItem);
  if (!sourceValidation?.ok || !targetValidation?.ok) {
    if (ruleKey) disabledRuleIds.add(ruleKey);
    myLog(
      `Skipping rule '${ruleKey}': invalid ItemStack typeId` +
        ` (sourceOk=${sourceValidation.ok} targetOk=${targetValidation.ok}` +
        ` source='${rule?.sourceItem}' target='${rule?.targetItem}'` +
        ` sourceError='${sourceValidation.error ?? ""}' targetError='${targetValidation.error ?? ""}')`,
      "ZipIt",
      true
    );
    return;
  }

  try {
    const sourceCount = countItemInContainer(container, rule.sourceItem);
    const minSourceCount = ruleSettings.minSourceCount ?? rule.defaultMinSourceCount;

    if (sourceCount < minSourceCount) return;
    if (sourceCount < rule.ratio) return;

    const packedCount = Math.floor(sourceCount / rule.ratio);
    if (packedCount <= 0) return;

    const targetCapacity = calculateTargetCapacity(container, rule.targetItem);

    // Must be able to place all produced target items.
    if (targetCapacity < packedCount) {
      myLog(
        `Rule '${ruleKey}': insufficient target capacity (targetCapacity=${targetCapacity} packedCount=${packedCount} targetItem='${rule.targetItem}')`,
        "ZipIt",
        true
      );
      return;
    }

    const sourceToRemove = packedCount * rule.ratio;

    const removedAmount = removeItemsFromContainer(container, rule.sourceItem, sourceToRemove);

    if (removedAmount !== sourceToRemove) {
      myLog(
        `Rule '${ruleKey}': failed removing source items (expected=${sourceToRemove} removed=${removedAmount} sourceItem='${rule.sourceItem}')`,
        "ZipIt",
        true
      );
      // Attempt best-effort rollback of whatever we removed.
      if (removedAmount > 0) {
        const rollbackAddOk = placeItemsDeterministically(container, rule.sourceItem, removedAmount);
        if (!rollbackAddOk) {
          myLog(
            `Rule '${ruleKey}': rollback failed after remove mismatch (rollbackAmount=${removedAmount} sourceItem='${rule.sourceItem}')`,
            "ZipIt",
            true
          );
        }
      }
      return;
    }

    const addSucceeded = placeItemsDeterministically(container, rule.targetItem, packedCount);

    if (!addSucceeded) {
      myLog(
        `Rule '${ruleKey}': failed placing target items (targetItem='${rule.targetItem}' addAmount=${packedCount})`,
        "ZipIt",
        true
      );
      // Roll back on unexpected failure
      const rollbackOk = placeItemsDeterministically(container, rule.sourceItem, sourceToRemove);
      if (!rollbackOk) {
        myLog(
          `Rule '${ruleKey}': rollback failed after target place failure (rollbackAmount=${sourceToRemove} sourceItem='${rule.sourceItem}')`,
          "ZipIt",
          true
        );
      }
    }
  } catch (error) {
    myLog(`Rule '${ruleKey}': unexpected error: ${stringifyError(error)}`, "ZipIt", true);
  }
}

function calculateTargetCapacity(container, targetItemId) {
  const maxStackSize = getMaxStackSize(targetItemId);
  let capacity = 0;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);

    if (!item) {
      capacity += maxStackSize;
      continue;
    }

    if (item.typeId === targetItemId) {
      capacity += Math.max(0, maxStackSize - item.amount);
    }
  }

  return capacity;
}

function getMaxStackSize(itemId) {
  try {
    const stack = new ItemStack(itemId, 1);
    const maxAmount = stack?.maxAmount;
    if (typeof maxAmount === "number" && Number.isFinite(maxAmount) && maxAmount >= 1) {
      return Math.floor(maxAmount);
    }
  } catch {
    // ignore and fall back
  }
  return 64;
}

function countItemInContainer(container, itemId) {
  let total = 0;

  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item) continue;
    if (item.typeId !== itemId) continue;

    total += item.amount;
  }

  return total;
}

function removeItemsFromContainer(container, itemId, amountToRemove) {
  let remaining = amountToRemove;
  let removed = 0;

  for (let slot = 0; slot < container.size; slot++) {
    if (remaining <= 0) break;

    const item = container.getItem(slot);
    if (!item) continue;
    if (item.typeId !== itemId) continue;

    if (item.amount <= remaining) {
      removed += item.amount;
      remaining -= item.amount;
      container.setItem(slot, undefined);
    } else {
      const newAmount = item.amount - remaining;
      removed += remaining;
      remaining = 0;

      const updated = new ItemStack(itemId, newAmount);
      container.setItem(slot, updated);
    }
  }

  return removed;
}

/**
 * Deterministic placement:
 * 1. Fill existing stacks of the same item first
 * 2. Then use empty slots
 * 3. Return false if not everything could be placed
 */
function placeItemsDeterministically(container, itemId, totalAmount) {
  let remaining = totalAmount;
  const maxStackSize = getMaxStackSize(itemId);

  // Phase 1: fill existing stacks first
  for (let slot = 0; slot < container.size; slot++) {
    if (remaining <= 0) return true;

    const item = container.getItem(slot);
    if (!item) continue;
    if (item.typeId !== itemId) continue;
    if (item.amount >= maxStackSize) continue;

    const freeInStack = maxStackSize - item.amount;
    const toAdd = Math.min(freeInStack, remaining);
    const newAmount = item.amount + toAdd;

    container.setItem(slot, new ItemStack(itemId, newAmount));
    remaining -= toAdd;
  }

  // Phase 2: use empty slots
  for (let slot = 0; slot < container.size; slot++) {
    if (remaining <= 0) return true;

    const item = container.getItem(slot);
    if (item) continue;

    const toPlace = Math.min(maxStackSize, remaining);
    container.setItem(slot, new ItemStack(itemId, toPlace));
    remaining -= toPlace;
  }

  return remaining === 0;
}

function getPlayerSettings(player) {
  const defaults = deepClone(DEFAULT_PLAYER_SETTINGS);

  if (!USE_DYNAMIC_PLAYER_SETTINGS) {
    return defaults;
  }

  try {
    const raw = player.getDynamicProperty(PLAYER_SETTINGS_PROPERTY_KEY);

    if (typeof raw !== "string" || raw.trim() === "") {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    return mergePlayerSettings(defaults, parsed);
  } catch (error) {
    myLog(`Failed reading player settings: ${stringifyError(error)}`, "ZipIt", true);
    return defaults;
  }
}

function savePlayerSettings(player, settings) {
  if (!USE_DYNAMIC_PLAYER_SETTINGS) return false;
  try {
    const raw = JSON.stringify(settings ?? {});
    if (raw.length > DYNAMIC_SETTINGS_MAX_BYTES) {
      myLog("Settings too large to save.", "ZipIt", true);
      return false;
    }
    player.setDynamicProperty(PLAYER_SETTINGS_PROPERTY_KEY, raw);
    return true;
  } catch (error) {
    myLog(`Failed saving player settings: ${stringifyError(error)}`, "ZipIt", true);
    return false;
  }
}

function resolveRuleSettings(playerSettings, rule) {
  const playerRuleSettings = playerSettings?.rules?.[rule.id];

  // Profile-based default:
  // - If the rule has profiles (rule.profile), enable if ANY profile is enabled in player settings.
  // - Otherwise, fallback to rule.enabledByDefault.
  const ruleProfiles = Array.isArray(rule?.profile) ? rule.profile : [];
  const profileEnabled =
    ruleProfiles.length > 0
      ? ruleProfiles.some((p) => playerSettings?.profiles?.[p] === true)
      : rule.enabledByDefault ?? true;

  return {
    // Rule-level setting overrides profile defaults.
    enabled:
      typeof playerRuleSettings?.enabled === "boolean"
        ? playerRuleSettings.enabled
        : profileEnabled,
    minSourceCount:
      playerRuleSettings?.minSourceCount ??
      rule.defaultMinSourceCount ??
      rule.ratio,
  };
}

function mergePlayerSettings(defaults, saved) {
  const result = deepClone(defaults);

  if (typeof saved?.enabled === "boolean") {
    result.enabled = saved.enabled;
  }

  if (saved?.profiles && typeof saved.profiles === "object") {
    if (typeof saved.profiles.miner === "boolean") result.profiles.miner = saved.profiles.miner;
    if (typeof saved.profiles.builder === "boolean") result.profiles.builder = saved.profiles.builder;
  }

  if (saved?.features && typeof saved.features === "object") {
    if (typeof saved.features.inventorySort === "boolean") {
      result.features.inventorySort = saved.features.inventorySort;
    }
  }

  if (saved?.debug && typeof saved.debug === "object") {
    if (saved.debug.level === "none" || saved.debug.level === "basic") {
      result.debug.level = saved.debug.level;
    }
  }

  if (saved?.rules && typeof saved.rules === "object") {
    for (const ruleId of Object.keys(saved.rules)) {
      const savedRule = saved.rules[ruleId];
      if (!savedRule || typeof savedRule !== "object") continue;

      if (!result.rules[ruleId]) result.rules[ruleId] = {};

      if (typeof savedRule.enabled === "boolean") {
        result.rules[ruleId].enabled = savedRule.enabled;
      }

      if (
        typeof savedRule.minSourceCount === "number" &&
        Number.isFinite(savedRule.minSourceCount) &&
        savedRule.minSourceCount >= 1
      ) {
        result.rules[ruleId].minSourceCount = Math.floor(savedRule.minSourceCount);
      }
    }
  }

  return result;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stringifyError(error) {
  try {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    return String(error);
  } catch {
    return "Unknown error";
  }
}