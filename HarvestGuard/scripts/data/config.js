/**
 * Harvest Guard – configuration constants.
 * toolGroups: each entry defines one selectable tool set (index maps to toolIndex in settings).
 * Wooden tools are intentionally excluded.
 */

export default {
  toolGroups: [
    {
      label: "Hoes",
      items: [
        "minecraft:iron_hoe",
        "minecraft:golden_hoe",
        "minecraft:diamond_hoe",
        "minecraft:netherite_hoe",
        "minecraft:copper_hoe"
      ]
    },
    {
      label: "Axes",
      items: [
        "minecraft:iron_axe",
        "minecraft:golden_axe",
        "minecraft:diamond_axe",
        "minecraft:netherite_axe",
        "minecraft:copper_axe"
      ]
    },
    {
      label: "Hoes & Axes",
      items: [
        "minecraft:iron_hoe",
        "minecraft:golden_hoe",
        "minecraft:diamond_hoe",
        "minecraft:netherite_hoe",
        "minecraft:copper_hoe",
        "minecraft:iron_axe",
        "minecraft:golden_axe",
        "minecraft:diamond_axe",
        "minecraft:netherite_axe",
        "minecraft:copper_axe"
      ]
    }
  ],
  hgSettingsKey: "hg_settings",
  usageMessage:
    "§a[Harvest Guard] usage:\n" +
    "     \"/scriptevent hg:settings\" for setting dialog.\n" +
    "     \"/scriptevent hg:restore\" to restore the values to default.\n" +
    "     \"/scriptevent hg:show\" will show all settings as found in the settings dialog.\n" +
    "     \"/scriptevent hg:active true|false\" to enable or disable the mod."
};
