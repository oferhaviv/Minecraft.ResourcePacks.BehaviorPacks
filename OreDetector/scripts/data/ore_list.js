/**
 * Ore Location Detector — ore definitions.
 *
 * Each entry defines:
 *   blockIds  — all block type IDs that count as this ore (normal, deepslate, raw block variants).
 *   label     — display name shown in the HUD.
 *   color     — §color code applied to the label.
 *
 * Order here controls the display order in the HUD.
 */
export const ORE_LIST = [
  {
    blockIds: ["minecraft:diamond_ore", "minecraft:deepslate_diamond_ore"],
    label: "Diamond",
    color: "§b",
  },
  {
    blockIds: ["minecraft:emerald_ore", "minecraft:deepslate_emerald_ore"],
    label: "Emerald",
    color: "§a",
  },
  {
    blockIds: ["minecraft:ancient_debris"],
    label: "Ancient Debris",
    color: "§4",
  },
  {
    blockIds: ["minecraft:gold_ore", "minecraft:deepslate_gold_ore", "minecraft:raw_gold_block"],
    label: "Gold",
    color: "§6",
  },
  {
    blockIds: ["minecraft:iron_ore", "minecraft:deepslate_iron_ore", "minecraft:raw_iron_block"],
    label: "Iron",
    color: "§7",
  },
  {
    blockIds: ["minecraft:copper_ore", "minecraft:deepslate_copper_ore", "minecraft:raw_copper_block"],
    label: "Copper",
    color: "§e",
  },
  {
    blockIds: [
      "minecraft:redstone_ore",
      "minecraft:deepslate_redstone_ore",
      "minecraft:lit_redstone_ore",
      "minecraft:lit_deepslate_redstone_ore",
    ],
    label: "Redstone",
    color: "§c",
  },
  {
    blockIds: ["minecraft:lapis_ore", "minecraft:deepslate_lapis_ore"],
    label: "Lapis",
    color: "§9",
  },
  {
    blockIds: ["minecraft:coal_ore", "minecraft:deepslate_coal_ore"],
    label: "Coal",
    color: "§8",
  },
];
