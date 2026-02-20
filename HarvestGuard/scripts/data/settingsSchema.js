/**
 * Harvest Guard – settings schema and defaults.
 * This file exports the settingsSchema.json data as a JavaScript module.
 */

export default {
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
