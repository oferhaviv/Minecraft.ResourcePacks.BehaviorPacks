import * as mc from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
const {world, system} = mc;
const DynDef = mc.DynamicPropertiesDefinition;

/* =========================
   Constants / Static Rules
========================= */

const TOOL = "minecraft:iron_hoe";
const DEBUG = true; // dev-only console logs (independent of per-player Debug level)
const USAGE_MESSAGE =
  '§aHi Please use:\n\t ".hg settings" for setting dialog\n\t ".hg restore" to restore the values to default';

// Player Dynamic Property key (JSON string)
const HG_SETTINGS_KEY = "hg_settings";

// Static rule map (do NOT mutate this)
const GUARDED = {
  playerBreakBlock: {
    "minecraft:wheat": { rule: "growth", state: "growth", mature: 7 },
    "minecraft:carrots": { rule: "growth", state: "growth", mature: 7 },
    "minecraft:potatoes": { rule: "growth", state: "growth", mature: 7 },
    "minecraft:beetroot": { rule: "growth", state: "growth", mature: 7 },

    "minecraft:nether_wart": { rule: "growth", state: "age", mature: 3 },
    "minecraft:cocoa": { rule: "growth", state: "age", mature: 2 },

    "minecraft:melon_stem": { rule: "preventAlways" },
    "minecraft:pumpkin_stem": { rule: "preventAlways" },

    // break-protection only
    "minecraft:sweet_berry_bush": { rule: "preventAlways" },
    "minecraft:cave_vines": { rule: "preventAlways" },
    "minecraft:cave_vines_head_with_berries": { rule: "preventAlways" },

    // vertical columns
    "minecraft:reeds": { rule: "preventBase" }, // sugar cane in your logs
    "minecraft:bamboo": { rule: "preventBase" },
    "minecraft:cactus": { rule: "preventBase" },
    "minecraft:bamboo_sapling": { rule: "preventAlways" },

    // keep for future compat (some editions might report differently)
    "minecraft:sugar_cane": { rule: "preventBase" },

    // farmland protection
    "minecraft:farmland": { rule: "preventAlways" },
  },

  itemUseOn: {
    "minecraft:sweet_berry_bush": { rule: "growth", state: "growth", mature: 3 },
  },
};

/* =========================
   Settings Model (per-player)
========================= */

const DEFAULT_SETTINGS = {
  enabled: true,

  // future-proof fields
  actionModeIndex: 0, // 0 = Always
  toolIndex: 0, // 0 = Iron Hoe

  crops: {
    wheat: true,
    carrots: true,
    potatoes: true,
    beetroot: true,
    netherWart: true,
    cocoa: true,
  },

  bases: {
    sugarCane: true, // reeds/sugar_cane
    bamboo: true,
    cactus: true,
  },

  protectFarmland: true,
  debugLevelIndex: 0, // 0=None, 1=Basic (for future; DEBUG constant still prints)
};

function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

// Merge saved settings into defaults (safe migration)
function mergeSettings(defaults, saved) {
  if (!saved || typeof saved !== "object") return defaults;

  const out = cloneDefaultSettings();

  // top-level primitives
  if (typeof saved.enabled === "boolean") out.enabled = saved.enabled;
  if (typeof saved.actionModeIndex === "number") out.actionModeIndex = saved.actionModeIndex;
  if (typeof saved.toolIndex === "number") out.toolIndex = saved.toolIndex;
  if (typeof saved.protectFarmland === "boolean") out.protectFarmland = saved.protectFarmland;
  if (typeof saved.debugLevelIndex === "number") out.debugLevelIndex = saved.debugLevelIndex;

  // crops
  if (saved.crops && typeof saved.crops === "object") {
    for (const k of Object.keys(out.crops)) {
      if (typeof saved.crops[k] === "boolean") out.crops[k] = saved.crops[k];
    }
  }

  // bases
  if (saved.bases && typeof saved.bases === "object") {
    for (const k of Object.keys(out.bases)) {
      if (typeof saved.bases[k] === "boolean") out.bases[k] = saved.bases[k];
    }
  }

  return out;
}

function getSettings(player) {
  try {
    const raw = player.getDynamicProperty(HG_SETTINGS_KEY);
    if (typeof raw !== "string" || raw.length === 0) {
      return cloneDefaultSettings();
    }
    const parsed = JSON.parse(raw);
    return mergeSettings(DEFAULT_SETTINGS, parsed);
  } catch (e) {
    // if anything goes wrong, fail-open to defaults
    return cloneDefaultSettings();
  }
}

function saveSettings(player, settings) {
  try {
    player.setDynamicProperty(HG_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    // optional debug
    if (DEBUG) console.warn(`[HG] saveSettings failed: ${e}`);
  }
}

function restoreToDefault(player) {
  // simplest: overwrite with defaults
  const d = cloneDefaultSettings();
  saveSettings(player, d);
  player.sendMessage("§a[Harvest Guard] Restored settings to defaults.");
}


/* =========================
   Guard Helpers
========================= */

function checkBlockBelowEqual(block) {
  const below = block.dimension.getBlock({
    x: block.location.x,
    y: block.location.y - 1,
    z: block.location.z,
  });
  return !!below && below.typeId === block.typeId;
}

function msg(m, event = "") {
  if (!DEBUG) return;
  const prefix = event ? `[HG ${event}] ` : "[HG] ";
  console.warn(prefix + m);
}

/* =========================
   UI: One Screen Settings
========================= */

function buildMenu(settings) {
  return new ModalFormData()
    .title("Harvest Guard Settings")

    .toggle("Enable", { defaultValue: settings.enabled })

    .dropdown("Action", ["Always"], { defaultValueIndex: settings.actionModeIndex ?? 0 })
    .dropdown("Tool", ["Iron Hoe"], { defaultValueIndex: settings.toolIndex ?? 0 })

    .label("Protect Crops:")
    .toggle("Wheat", { defaultValue: settings.crops.wheat })
    .toggle("Carrots", { defaultValue: settings.crops.carrots })
    .toggle("Potatoes", { defaultValue: settings.crops.potatoes })
    .toggle("Beetroot", { defaultValue: settings.crops.beetroot })
    .toggle("Nether Wart", { defaultValue: settings.crops.netherWart })
    .toggle("Cocoa", { defaultValue: settings.crops.cocoa })

    .label("Protect Base:")
    .toggle("Sugar Cane", { defaultValue: settings.bases.sugarCane })
    .toggle("Bamboo", { defaultValue: settings.bases.bamboo })
    .toggle("Cactus", { defaultValue: settings.bases.cactus })

    .toggle("Protect Breaking Farmland", { defaultValue: settings.protectFarmland })
    .dropdown("Debug level", ["None", "Basic"], { defaultValueIndex: settings.debugLevelIndex ?? 0 });
}

// Form values order MUST match buildMenu()
function applyFormValuesToSettings(values, currentSettings) {
  const s = mergeSettings(DEFAULT_SETTINGS, currentSettings);

  // indices based on buildMenu order
  // 0 Enable
  // 1 Action
  // 2 Tool
  // 3 Wheat
  // 4 Carrots
  // 5 Potatoes
  // 6 Beetroot
  // 7 Nether Wart
  // 8 Cocoa
  // 9 Sugar Cane
  // 10 Bamboo
  // 11 Cactus
  // 12 Protect Farmland
  // 13 Debug level

  s.enabled = !!values[0];
  s.actionModeIndex = Number(values[1] ?? 0);
  s.toolIndex = Number(values[2] ?? 0);

  s.crops.wheat = !!values[3];
  s.crops.carrots = !!values[4];
  s.crops.potatoes = !!values[5];
  s.crops.beetroot = !!values[6];
  s.crops.netherWart = !!values[7];
  s.crops.cocoa = !!values[8];

  s.bases.sugarCane = !!values[9];
  s.bases.bamboo = !!values[10];
  s.bases.cactus = !!values[11];

  s.protectFarmland = !!values[12];
  s.debugLevelIndex = Number(values[13] ?? 0);

  return s;
}

function showMenuWithRetry(player, triesLeft = 30, waitTime = 2) {
  const current = getSettings(player);
  const form = buildMenu(current);

  form.show(player).then((res) => {
    if (res.canceled && res.cancelationReason === "UserBusy" && triesLeft > 0) {
      system.runTimeout(() => showMenuWithRetry(player, triesLeft - 1, waitTime), waitTime);
      return;
    }
    if (res.canceled) return;

    const next = applyFormValuesToSettings(res.formValues ?? [], current);
    saveSettings(player, next);

    player.sendMessage("§a[Harvest Guard] Settings saved.");
    if (DEBUG) console.warn(`[HG] Saved settings for ${player.name}: ${JSON.stringify(next)}`);
  });
}

/* =========================
   Guard Logic (uses settings)
========================= */

function shouldApplyRuleForBlock(blockTypeId, settings) {
  // Master enable
  if (!settings.enabled) return false;

  // Farmland toggle
  if (blockTypeId === "minecraft:farmland") {
    return !!settings.protectFarmland;
  }

  // Vertical bases toggles
  if (blockTypeId === "minecraft:reeds" || blockTypeId === "minecraft:sugar_cane") {
    return !!settings.bases.sugarCane;
  }
  if (blockTypeId === "minecraft:bamboo") {
    return !!settings.bases.bamboo;
  }
  if (blockTypeId === "minecraft:cactus") {
    return !!settings.bases.cactus;
  }

  // Crop toggles (growth rules)
  if (blockTypeId === "minecraft:wheat") return !!settings.crops.wheat;
  if (blockTypeId === "minecraft:carrots") return !!settings.crops.carrots;
  if (blockTypeId === "minecraft:potatoes") return !!settings.crops.potatoes;
  if (blockTypeId === "minecraft:beetroot") return !!settings.crops.beetroot;
  if (blockTypeId === "minecraft:nether_wart") return !!settings.crops.netherWart;
  if (blockTypeId === "minecraft:cocoa") return !!settings.crops.cocoa;

  // Everything else (stems / vines / berry bushes) stays protected when enabled
  return true;
}

function applyGuard({ eventName, ev, block, itemStack, player }) {
  if (!block) return;

  // tool filter (future: toolIndex mapping)
  if (!itemStack || itemStack.typeId !== TOOL) return;

  const settings = player ? getSettings(player) : cloneDefaultSettings();

  // if this block's protection is disabled in settings → do nothing
  if (!shouldApplyRuleForBlock(block.typeId, settings)) return;

  const states = block?.permutation?.getAllStates?.() ?? {};

  // dev debug
  if (DEBUG) {
    console.warn(
      `[HG ${eventName}] ${block.typeId} @ ${block.location.x},${block.location.y},${block.location.z} | ${JSON.stringify(states)}`
    );
  }

  const cfg = GUARDED[eventName]?.[block.typeId];
  if (!cfg) return;

  let cancel = false;
  let reason = null;

  if (cfg.rule === "preventAlways") {
    cancel = true;
    reason = "preventAlways";
  } else if (cfg.rule === "preventBase") {
    if (!checkBlockBelowEqual(block)) {
      cancel = true;
      reason = "preventBase";
    }
  } else if (cfg.rule === "growth") {
    const v = states[cfg.state];
    if (typeof v === "number") {
      if (v !== cfg.mature) {
        cancel = true;
        reason = `growth(${cfg.state}=${v}!=${cfg.mature})`;
      }
    } else {
      // fail-open
      if (DEBUG) console.warn(`[HG ${eventName}] No numeric state '${cfg.state}' on ${block.typeId}`);
    }
  }

  if (cancel) {
    ev.cancel = true;
    if (DEBUG && reason) console.warn(`[HG ${eventName}] CANCELLED ${block.typeId} reason=${reason}`);
  }
}

/* =========================
   Event Wiring
========================= */

// =========================
// Safe event subscriptions (prevents "subscribe of undefined")
// =========================

// Dynamic Properties registration (only if supported by this API version)
if (world.afterEvents?.worldInitialize?.subscribe) {
  world.afterEvents.worldInitialize.subscribe((ev) => {
    const DynDef = mc.DynamicPropertiesDefinition;

    if (!DynDef) {
      console.warn("[HG] DynamicPropertiesDefinition not available. Need fallback (scoreboard).");
      return;
    }

    const def = new DynDef();
    def.defineString(HG_SETTINGS_KEY, 4096);

    // Most builds expose propertyRegistry here
    ev.propertyRegistry.registerPlayerDynamicProperties(def);

    console.warn("[HG] Registered player dynamic properties.");
  });
} else {
  console.warn("[HG] afterEvents.worldInitialize not available. Need fallback (scoreboard).");
}

// LEFT CLICK (break) subscription
if (world.beforeEvents?.playerBreakBlock?.subscribe) {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    applyGuard({
      eventName: "playerBreakBlock",
      ev,
      block: ev.block,
      itemStack: ev.itemStack,
      player: ev.player ?? ev.source,
    });
  });
} else {
  console.warn("[HG] beforeEvents.playerBreakBlock not available in this API version.");
}

// Chat commands subscription
if (world.beforeEvents?.chatSend?.subscribe) {
  world.beforeEvents.chatSend.subscribe((data) => {
    const message = data.message?.trim().toLowerCase();

    if (message === ".hg") {
      msg(`message with .hg found from ${data.sender?.name ?? "null"}`);
      data.cancel = true;
      data.sender.sendMessage(USAGE_MESSAGE);
      return;
    }

    if (message === ".hg settings") {
      data.cancel = true;
      system.runTimeout(() => showMenuWithRetry(data.sender), 2);
      return;
    }

    if (message === ".hg restore") {
      data.cancel = true;
      restoreToDefault(data.sender);
      return;
    }
  });
} else {
  console.warn("[HG] beforeEvents.chatSend not available in this API version.");
}

