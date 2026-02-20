/**
 * Harvest Guard – static data and structures loaded from JSON files.
 * This file consolidates data from: guarded.json, settingsSchema.json, config.json
 * 
 * Note: Data is kept in sync with the JSON files in this directory.
 * To update, edit the JSON files and then update the corresponding values below.
 */

// Data from guarded.json
const GUARDED_DATA = {
  playerBreakBlock: {
    "minecraft:wheat": { rule: "growth", state: "growth", mature: 7 },
    "minecraft:carrots": { rule: "growth", state: "growth", mature: 7 },
    "minecraft:potatoes": { rule: "growth", state: "growth", mature: 7 },
    "minecraft:beetroot": { rule: "growth", state: "growth", mature: 7 },
    "minecraft:nether_wart": { rule: "growth", state: "age", mature: 3 },
    "minecraft:cocoa": { rule: "growth", state: "age", mature: 2 },
    "minecraft:melon_stem": { rule: "preventAlways" },
    "minecraft:pumpkin_stem": { rule: "preventAlways" },
    "minecraft:sweet_berry_bush": { rule: "preventAlways" },
    "minecraft:cave_vines": { rule: "preventAlways" },
    "minecraft:cave_vines_head_with_berries": { rule: "preventAlways" },
    "minecraft:reeds": { rule: "preventBase" },
    "minecraft:bamboo": { rule: "preventBase" },
    "minecraft:cactus": { rule: "preventBase" },
    "minecraft:bamboo_sapling": { rule: "preventAlways" },
    "minecraft:sugar_cane": { rule: "preventBase" },
    "minecraft:farmland": { rule: "preventAlways" }
  },
  itemUseOn: {
    "minecraft:sweet_berry_bush": { rule: "growth", state: "growth", mature: 3 }
  }
};

// Data from config.json
const CONFIG_DATA = {
  tools: ["minecraft:iron_hoe"],
  hgSettingsKey: "hg_settings",
  usageMessage: "§a[Harvest Guard] Hi Please use:\n     \".hg settings\" for setting dialog.\n     \".hg restore\" to restore the values to default.\n     \".hg show settings\" will show all settings as found in the settings dialog."
};

// Data from settingsSchema.json
const SETTINGS_DATA = {
  version: 1,
  defaults: {
    enabled: true,
    actionModeIndex: 0,
    toolIndex: 0,
    protectFarmland: true,
    debugLevelIndex: 0,
    crops: {
      wheat: true,
      carrots: true,
      potatoes: true,
      beetroot: true,
      netherWart: true,
      cocoa: true
    },
    stems: {
      melonStem: true,
      pumpkinStem: true
    },
    vines: {
      sweetBerryBush: true,
      caveVines: true,
      caveVinesHead: true
    },
    bases: {
      sugarCane: true,
      bamboo: true,
      cactus: true
    }
  }
};

// Export constants from config.json
// TOOLS is an array for future extensibility, TOOL is the first item for backward compatibility
export const TOOLS = Array.isArray(CONFIG_DATA.tools) ? CONFIG_DATA.tools : (CONFIG_DATA.tool ? [CONFIG_DATA.tool] : ["minecraft:iron_hoe"]);
export const TOOL = TOOLS[0]; // First tool for backward compatibility
export const HG_SETTINGS_KEY = CONFIG_DATA.hgSettingsKey;
export const USAGE_MESSAGE = CONFIG_DATA.usageMessage;

// Export GUARDED from guarded.json
export const GUARDED = GUARDED_DATA;

// Export DEFAULT_SETTINGS from settingsSchema.json (extract defaults property)
export const DEFAULT_SETTINGS = SETTINGS_DATA.defaults;
