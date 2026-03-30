/**
 * Ore Location Detector — pickaxe tier groups.
 *
 * Each group defines which pickaxe item IDs activate the HUD.
 * The player selects a group in settings; index 0 is the default (all pickaxes).
 * Label strings appear verbatim in the settings dropdown.
 */
export const PICKAXE_GROUPS = [
  {
    label: "All Pickaxes",
    types: [
      "minecraft:wooden_pickaxe",
      "minecraft:stone_pickaxe",
      "minecraft:iron_pickaxe",
      "minecraft:golden_pickaxe",
      "minecraft:diamond_pickaxe",
      "minecraft:netherite_pickaxe",
    ],
  },
  {
    label: "Wooden & Stone only",
    types: [
      "minecraft:wooden_pickaxe",
      "minecraft:stone_pickaxe",
    ],
  },
  {
    label: "Iron, Gold & Copper only",
    types: [
      "minecraft:iron_pickaxe",
      "minecraft:golden_pickaxe",
      "minecraft:copper_pickaxe",
    ],
  },
  {
    label: "Diamond & Netherite only",
    types: [
      "minecraft:diamond_pickaxe",
      "minecraft:netherite_pickaxe",
    ],
  },
];
