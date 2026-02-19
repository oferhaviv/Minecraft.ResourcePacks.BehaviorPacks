import * as mc from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";


//#region Static Rules
/* =========================
   Constants / Static Rules
========================= */
let GLOBAL_SETTINGS = "";
const { world, system } = mc;
const TOOL = "minecraft:iron_hoe";
const USAGE_MESSAGE =
  '§a[Harvest Guard] Hi Please use:\n     ".hg settings" for setting dialog.\n     ".hg restore" to restore the values to default.\n     ".hg show settings" will show all settings as found in the settings dialog.';

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
//#endregion 

//#region Settings Model (per-player)

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

function sdbg(message) {
  logHG (message,"SETTINGS",false);
}
function cloneDefaultSettings() {
  const out =JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  GLOBAL_SETTINGS=out;
  return out;
}



// Merge saved settings into defaults (safe migration)
function mergeSettings(defaults, saved) {
  const out = cloneDefaultSettings();
  if (!saved || typeof saved !== "object") {
    sdbg("mergeSettings: saved invalid -> returning defaults");
    return out;
  }

  sdbg(`mergeSettings IN saved=${JSON.stringify(saved)}`);

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

  sdbg(`mergeSettings OUT out=${JSON.stringify(out)}`);

  //update global value
  GLOBAL_SETTINGS = out;
  return out;
}

function getSettings(player) {
  try {
    if (GLOBAL_SETTINGS!="")
    {
      return GLOBAL_SETTINGS;
    }
    const raw = player.getDynamicProperty(HG_SETTINGS_KEY);

    if (typeof raw !== "string" || raw.length === 0) {

      return cloneDefaultSettings();
    }

    const parsed = JSON.parse(raw);

    sdbg(`getSettings parsed keys=${Object.keys(parsed ?? {}).join(",")}`);

    const merged = mergeSettings(DEFAULT_SETTINGS, parsed);


    return merged;
  } catch (e) {
      logHG(`getSettings ERROR -> defaults. err=${e}`,"getSettings",true );
    return cloneDefaultSettings();
  }
}

function saveSettings(player, settings) {
  try {
    const str = JSON.stringify(settings);
    player.setDynamicProperty(HG_SETTINGS_KEY, str);

    // verify immediate read-back (super useful)
    const back = player.getDynamicProperty(HG_SETTINGS_KEY);
    sdbg(`saveSettings readBack type=${typeof back} value=${String(back).slice(0, 200)}`);
  } catch (e) {
    sdbg(`saveSettings FAILED err=${e}`);
  }
}


function restoreToDefault(player) {
  // simplest: overwrite with defaults
  const d = cloneDefaultSettings();
  saveSettings(player, d);
  player.sendMessage("§a[Harvest Guard] Restored settings to defaults.");
}
//#endregion


//#region Guard Helpers


function checkBlockBelowEqual(block) {
  const below = block.dimension.getBlock({
    x: block.location.x,
    y: block.location.y - 1,
    z: block.location.z,
  });
  return !!below && below.typeId === block.typeId;
}

function logHG(m, event = "", warning = false) {
  let logDebug =0;
  if (GLOBAL_SETTINGS !="")
  {
    logDebug = GLOBAL_SETTINGS.debugLevelIndex
  }

  if (logDebug == 0) return;
  const prefix = event ? `[HG][${event}] ` : "[HG] ";
  if (!warning) 
  {console.info(prefix + m);}
  else {console.warn(prefix + m);}

}
//#endregion


//#region UI: One Screen Settings


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

  // In your API build, ModalFormData.label() DOES consume a slot in formValues (undefined).
  // Your formValues layout is:
  // 0 Enable
  // 1 Action
  // 2 Tool
  // 3 label "Protect Crops:"    -> undefined
  // 4 Wheat
  // 5 Carrots
  // 6 Potatoes
  // 7 Beetroot
  // 8 Nether Wart
  // 9 Cocoa
  // 10 label "Protect Base:"   -> undefined
  // 11 Sugar Cane
  // 12 Bamboo
  // 13 Cactus
  // 14 Protect Farmland
  // 15 Debug level

  s.enabled = !!values[0];
  s.actionModeIndex = Number(values[1] ?? 0);
  s.toolIndex = Number(values[2] ?? 0);

  // crops (shifted by +1 because of label at idx 3)
  s.crops.wheat = !!values[4];
  s.crops.carrots = !!values[5];
  s.crops.potatoes = !!values[6];
  s.crops.beetroot = !!values[7];
  s.crops.netherWart = !!values[8];
  s.crops.cocoa = !!values[9];

  // bases (shifted by +1 because of label at idx 10)
  s.bases.sugarCane = !!values[11];
  s.bases.bamboo = !!values[12];
  s.bases.cactus = !!values[13];

  s.protectFarmland = !!values[14];
  s.debugLevelIndex = Number(values[15] ?? 0);

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
    if (res.canceled) {
      logHG(`UI canceled reason=${res.cancelationReason}`,"showMenuWithRetry",true);
      return;
    }

    const fv = res.formValues ?? [];
    logHG(`formValues len=${fv.length} values=${JSON.stringify(fv)}`,"showMenuWithRetry");

    fv.forEach((v, i) => logHG(`idx ${i} = ${JSON.stringify(v)}`,"showMenuWithRetry"));

    const next = applyFormValuesToSettings(res.formValues ?? [], current);
    saveSettings(player, next);

    player.sendMessage("§a[Harvest Guard] Settings saved.");
    logHG(`Saved settings for ${player.name}: ${JSON.stringify(next)}`,"showMenuWithRetry");
  });
}
//#endregion


//#region Guard Logic (uses settings)


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

  logHG(`${block.typeId} @ ${block.location.x},${block.location.y},${block.location.z} | ${JSON.stringify(states)}`,eventName);
  

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
      logHG(`No numeric state '${cfg.state}' on ${block.typeId}`,eventName,true);
    }
  }

  if (cancel) {
    ev.cancel = true;
    if (reason) logHG(`CANCELLED ${block.typeId} reason=${reason}`,eventName,true);
  }
}


//#endregion

//#region Event Wiring


// =========================
// Safe event subscriptions (prevents "subscribe of undefined")
// =========================




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
  logHG("not available in this API version.", "beforeEvents.playerBreakBlock",true)

}

// Chat commands subscription
if (world.beforeEvents?.chatSend?.subscribe) {
  world.beforeEvents.chatSend.subscribe((data) => {
    const message = data.message?.trim().toLowerCase().replace(/\s+/g," ");

    if (message === ".hg") {
      logHG(`message with .hg found, sender:${data.sender?.name ?? "null"} message: ${message}`);
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
    if (message === ".hg show settings") {
      data.cancel = true;
      const s = getSettings(data.sender);
      data.sender.sendMessage("§a[Harvest Guard] " + JSON.stringify(s));
      return;
    }

  });
} else {
  logHG("not available in this API version.","beforeEvents.chatSend",true);
}
//#endregion 
