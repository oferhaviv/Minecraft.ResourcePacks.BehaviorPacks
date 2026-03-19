import { world, system, ItemStack } from "@minecraft/server";
import { PACKING_RULES } from "./data/packing_rules";
import { DEFAULT_PLAYER_SETTINGS } from "./data/default_player_settings";
import { myLog } from "./myLog.js";

const SCAN_INTERVAL_TICKS = 20;
const PLAYER_SETTINGS_PROPERTY_KEY = "zipit:settings";
const USE_DYNAMIC_PLAYER_SETTINGS = true;
const DYNAMIC_SETTINGS_MAX_BYTES = 8192;

const RULES = Array.isArray(PACKING_RULES) ? PACKING_RULES : [];

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

// Simple chat-based command handler for ZipIt:
// /zp get
// /zp set <ruleIdOrItemId> <true|false>
function registerChatCommands() {
  const handler = (ev) => {
    try {
      const message = ev?.message?.trim();
      const sender = ev?.sender;
      if (!message || !sender) return;

      if (!(message.startsWith("/zp") || message.startsWith("zp "))) return;

      // Prevent the message from showing as normal chat.
      if ("cancel" in ev) {
        ev.cancel = true;
      }

      const withoutPrefix = message.startsWith("/zp")
        ? message.slice(3).trim()
        : message.slice(2).trim();

      if (!withoutPrefix) {
        sender.sendMessage("ZipIt: usage: /zp get | /zp set <item> <true|false>");
        return;
      }

      const parts = withoutPrefix.split(/\s+/);
      const sub = parts[0]?.toLowerCase();

      if (sub === "get") {
        handleZpGet(sender);
      } else if (sub === "set") {
        handleZpSet(sender, parts.slice(1));
      } else {
        sender.sendMessage("ZipIt: unknown subcommand. Use /zp get or /zp set.");
      }
    } catch (error) {
      myLog(`Command handler error: ${stringifyError(error)}`, "ZipIt", true);
    }
  };

  // Prefer beforeEvents so we can cancel the message.
  if (world.beforeEvents?.chatSend?.subscribe) {
    world.beforeEvents.chatSend.subscribe(handler);
  } else if (world.afterEvents?.chatSend?.subscribe) {
    world.afterEvents.chatSend.subscribe(handler);
  }
}

registerChatCommands();

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
    player.sendMessage("ZipIt: usage: /zp set <itemOrRuleId> <true|false>");
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

    player.sendMessage(
      `ZipIt: rule '${rule.id}' (${rule.sourceItem}) set to enabled=${value}.`
    );
  } catch (error) {
    myLog(`Failed /zp set: ${stringifyError(error)}`, "ZipIt", true);
    player.sendMessage("ZipIt: failed to update settings. See log.");
  }
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
  const sourceCount = countItemInContainer(container, rule.sourceItem);
  const minSourceCount = ruleSettings.minSourceCount ?? rule.defaultMinSourceCount;

  if (sourceCount < minSourceCount) return;
  if (sourceCount < rule.ratio) return;

  const packedCount = Math.floor(sourceCount / rule.ratio);
  if (packedCount <= 0) return;

  const targetCapacity = calculateTargetCapacity(container, rule.targetItem);

  // Must be able to place all produced target items.
  if (targetCapacity < packedCount) {
    return;
  }

  const sourceToRemove = packedCount * rule.ratio;

  const removedAmount = removeItemsFromContainer(container, rule.sourceItem, sourceToRemove);

  if (removedAmount !== sourceToRemove) {
    if (removedAmount > 0) {
      placeItemsDeterministically(container, rule.sourceItem, removedAmount);
    }
    return;
  }

  const addSucceeded = placeItemsDeterministically(container, rule.targetItem, packedCount);

  if (!addSucceeded) {
    // Roll back on unexpected failure
    placeItemsDeterministically(container, rule.sourceItem, sourceToRemove);
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

  return {
    enabled: playerRuleSettings?.enabled ?? rule.enabledByDefault ?? true,
    minSourceCount:
      playerRuleSettings?.minSourceCount ?? rule.defaultMinSourceCount ?? rule.ratio,
  };
}

function mergePlayerSettings(defaults, saved) {
  const result = deepClone(defaults);

  if (typeof saved?.enabled === "boolean") {
    result.enabled = saved.enabled;
  }

  if (saved?.rules && typeof saved.rules === "object") {
    for (const ruleId of Object.keys(saved.rules)) {
      const savedRule = saved.rules[ruleId];
      if (!savedRule || typeof savedRule !== "object") continue;

      if (!result.rules[ruleId]) {
        result.rules[ruleId] = {};
      }

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