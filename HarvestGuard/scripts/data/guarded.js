/**
 * Harvest Guard – guarded blocks configuration.
 * This file exports the guarded.json data as a JavaScript module.
 */

export default {
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
