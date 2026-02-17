import { world } from "@minecraft/server";

const TOOL = "minecraft:iron_hoe";
const DEBUG = true;
const GUARDED = {
  playerBreakBlock: {
    "minecraft:wheat":      { rule: "growth", state: "growth", mature: 7 },
    "minecraft:carrots":    { rule: "growth", state: "growth", mature: 7 },
    "minecraft:potatoes":   { rule: "growth", state: "growth", mature: 7 },
    "minecraft:beetroot":   { rule: "growth", state: "growth", mature: 7 },

    "minecraft:nether_wart": { rule: "growth", state: "age", mature: 3 },
    "minecraft:cocoa":       { rule: "growth", state: "age", mature: 2 },

    "minecraft:melon_stem":   { rule: "preventAlways" },
    "minecraft:pumpkin_stem": { rule: "preventAlways" },

    // break-protection only
    "minecraft:sweet_berry_bush": { rule: "preventAlways" },
    "minecraft:cave_vines": { rule: "preventAlways" },
    "minecraft:cave_vines_head_with_berries": { rule: "preventAlways" },
    "minecraft:reeds":          { rule: "preventBase" },
    "minecraft:bamboo":         { rule: "preventBase" },
    "minecraft:cactus":         { rule: "preventBase"},
    "minecraft:bamboo_sapling": { rule: "preventAlways" },
    "minecraft:sugar_cane": { rule: "preventBase" },
    "minecraft:farmland" : { rule: "preventAlways" }
  },

  itemUseOn: {
    // We'll refine these after mapping the real states on use
    "minecraft:sweet_berry_bush": { rule: "growth", state: "growth", mature: 3 }

    // NOTE: cave vines "use" is special; keep mapping via DEBUG first
    // "minecraft:cave_vines": ...
    // "minecraft:cave_vines_head_with_berries": ...
  }
};

function checkBlockBelowEqual(block) {
  const below = block.dimension.getBlock({
    x: block.location.x,
    y: block.location.y - 1,
    z: block.location.z,
  });
  return !!below && below.typeId === block.typeId;
}

function applyGuard({ eventName, ev, block, itemStack }) {
  if (!block) return;
  // tool filter
  if (!itemStack || itemStack.typeId !== TOOL) return;

  const states = block?.permutation?.getAllStates?.() ?? {};

  // debug for exploration
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
    // Both events support cancel
    ev.cancel = true;
    if (DEBUG && reason) console.warn(`[HG ${eventName}] CANCELLED ${block.typeId} reason=${reason}`);
  }
}

// LEFT CLICK (break)
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  applyGuard({
    eventName: "playerBreakBlock",
    ev,
    block: ev.block,
    itemStack: ev.itemStack
  });
});