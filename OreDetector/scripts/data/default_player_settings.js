/**
 * Ore Location Detector — default per-player settings.
 */
export const DEFAULT_PLAYER_SETTINGS = {
  /** Master on/off toggle. */
  enabled: false,
  /** Index into PICKAXE_GROUPS — which pickaxe tier activates the HUD. 0 = All. */
  pickaxeGroup: 0,
  /** Per-ore visibility toggles. Keys match ORE_LIST[n].key. */
  ores: {
    diamond:       true,
    emerald:       true,
    ancient_debris: true,
    gold:          true,
    iron:          true,
    copper:        true,
    redstone:      true,
    lapis:         true,
    coal:          true,
  },
  debug: {
    /** "none" | "basic" */
    level: "none",
  },
};
