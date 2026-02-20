/**
 * Harvest Guard – static data and structures.
 * JSON equivalents: data/guarded.json, data/settingsSchema.json
 */

// Tool required for guard actions
export const TOOL = "minecraft:iron_hoe";

// Player dynamic property key (JSON string)
export const HG_SETTINGS_KEY = "hg_settings";

export const USAGE_MESSAGE =
  '§a[Harvest Guard] Hi Please use:\n     ".hg settings" for setting dialog.\n     ".hg restore" to restore the values to default.\n     ".hg show settings" will show all settings as found in the settings dialog.';

/** Static rule map (do NOT mutate). See data/guarded.json for JSON format. */
export const GUARDED = {
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

    "minecraft:farmland": { rule: "preventAlways" },
  },

  itemUseOn: {
    "minecraft:sweet_berry_bush": { rule: "growth", state: "growth", mature: 3 },
  },
};

/** Default per-player settings. See data/settingsSchema.json for schema. */
export const DEFAULT_SETTINGS = {
  enabled: true,
  actionModeIndex: 0,
  toolIndex: 0,

  crops: {
    wheat: true,
    carrots: true,
    potatoes: true,
    beetroot: true,
    netherWart: true,
    cocoa: true,
  },

  bases: {
    sugarCane: true,
    bamboo: true,
    cactus: true,
  },

  protectFarmland: true,
  debugLevelIndex: 0,
};
