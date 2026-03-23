/**
 * Harvest Guard – DEV-ONLY validation environment builder.
 *
 * Spawns a structured test area covering every guarded block type at every
 * relevant growth/age stage so a developer can walk through and verify that
 * all guard rules fire correctly in-game.
 *
 * Trigger:  /scriptevent hg:validation
 * Requires: Debug Level set to Basic (checked at runtime).
 *
 * DEV ONLY – remove this file and its import in main.js before publishing.
 */

import { system, BlockPermutation, ItemStack } from "@minecraft/server";
import { getSettings, logHG } from "./settingsManager.js";
import { TOOL_GROUPS } from "./data/data.js";

const TAG = "hg:validation";

// ─── Low-level block helper ───────────────────────────────────────────────────

function setBlock(dim, x, y, z, typeId, states = {}) {
  try {
    const block = dim.getBlock({ x, y, z });
    if (!block) return;
    block.setPermutation(BlockPermutation.resolve(typeId, states));
  } catch (e) {
    logHG(`setBlock ${typeId} @${x},${y},${z}: ${e}`, TAG, true, true);
  }
}

// ─── Area clearing (one z-slice per call, spread across ticks) ───────────────

/**
 * Clear one z-slice of the build area:
 *   – solid stone base at floorY-1
 *   – air from floorY to ceilY+1 (inclusive)
 *   – stone floor tile at floorY (overwritten per-row later)
 */
function clearSlice(dim, ox, worldZ, floorY) {
  const ceilY = floorY + 6;
  for (let dx = -1; dx < 13; dx++) {
    const x = ox + dx;
    setBlock(dim, x, floorY - 1, worldZ, "minecraft:stone");
    for (let dy = floorY; dy <= ceilY + 1; dy++) {
      setBlock(dim, x, dy, worldZ, "minecraft:air");
    }
    setBlock(dim, x, floorY, worldZ, "minecraft:stone");
  }
}

// ─── Row builders ─────────────────────────────────────────────────────────────

/** Rows 1–4: growth crops (wheat / carrots / potatoes / beetroot, growth 0–7). */
function rowGrowthCrop(dim, ox, rz, floorY, blockId) {
  setBlock(dim, ox, floorY, rz, "minecraft:water");
  for (let i = 0; i < 8; i++) {
    setBlock(dim, ox + 1 + i, floorY,     rz, "minecraft:farmland");
    setBlock(dim, ox + 1 + i, floorY + 1, rz, blockId, { growth: i });
  }
}

/** Row 5: Nether wart – age 0–3 on soul sand. */
function rowNetherWart(dim, ox, rz, floorY) {
  for (let i = 0; i < 4; i++) {
    setBlock(dim, ox + i, floorY,     rz, "minecraft:soul_sand");
    setBlock(dim, ox + i, floorY + 1, rz, "minecraft:nether_wart", { age: i });
  }
}

/**
 * Row 6: Cocoa – age 0–2, attached to jungle log.
 * Pattern: log at (x, cropY, rz), cocoa at (x+1, cropY, rz) facing east (direction 3).
 * Three sets spaced 3 blocks apart.
 */
function rowCocoa(dim, ox, rz, floorY) {
  for (let i = 0; i < 3; i++) {
    const x = ox + i * 3;
    setBlock(dim, x,     floorY + 1, rz, "minecraft:jungle_log");
    setBlock(dim, x + 1, floorY + 1, rz, "minecraft:cocoa", { age: i, direction: 1 });
  }
}

/** Row 7: Melon stem – preventAlways; one melon block adjacent for visual context. */
function rowMelonStem(dim, ox, rz, floorY) {
  setBlock(dim, ox, floorY, rz, "minecraft:water");
  for (let i = 0; i < 4; i++) {
    setBlock(dim, ox + 1 + i, floorY,     rz, "minecraft:farmland");
    setBlock(dim, ox + 1 + i, floorY + 1, rz, "minecraft:melon_stem", { growth: i * 2 });
  }
  setBlock(dim, ox + 6, floorY,     rz, "minecraft:stone");
  setBlock(dim, ox + 6, floorY + 1, rz, "minecraft:melon_block");
}

/** Row 8: Pumpkin stem – preventAlways; one pumpkin block adjacent for visual context. */
function rowPumpkinStem(dim, ox, rz, floorY) {
  setBlock(dim, ox, floorY, rz, "minecraft:water");
  for (let i = 0; i < 4; i++) {
    setBlock(dim, ox + 1 + i, floorY,     rz, "minecraft:farmland");
    setBlock(dim, ox + 1 + i, floorY + 1, rz, "minecraft:pumpkin_stem", { growth: i * 2 });
  }
  setBlock(dim, ox + 6, floorY,     rz, "minecraft:stone");
  setBlock(dim, ox + 6, floorY + 1, rz, "minecraft:pumpkin");
}

/** Row 9: Sweet berry bush – preventAlways; 3 growth stages on dirt. */
function rowSweetBerry(dim, ox, rz, floorY) {
  for (let i = 0; i < 3; i++) {
    setBlock(dim, ox + i, floorY,     rz, "minecraft:dirt");
    setBlock(dim, ox + i, floorY + 1, rz, "minecraft:sweet_berry_bush", { growth: i });
  }
}

/**
 * Row 10: Cave vines – 3 variants hanging from individual stone ceilings.
 * Stone ceiling at floorY+6; vine block one below at floorY+5.
 */
function rowCaveVines(dim, ox, rz, floorY) {
  const ceilY = floorY + 6;
  const variants = [
    "minecraft:cave_vines",
    "minecraft:cave_vines_head_with_berries",
    "minecraft:cave_vines_body_with_berries",
  ];
  for (let i = 0; i < variants.length; i++) {
    const x = ox + i * 2;
    setBlock(dim, x, ceilY,     rz, "minecraft:stone");
    setBlock(dim, x, ceilY - 1, rz, variants[i]);
  }
}

/**
 * Row 11: Sugar cane (reeds) – preventBase.
 * 3 columns (height 1, 2, 3) on sand; each column has its own water source to its west.
 */
function rowSugarCane(dim, ox, rz, floorY) {
  for (let col = 0; col < 3; col++) {
    const waterX = ox + col * 3;
    const sandX  = ox + col * 3 + 1;
    setBlock(dim, waterX, floorY, rz, "minecraft:water");
    setBlock(dim, sandX,  floorY, rz, "minecraft:sand");
    for (let h = 0; h <= col; h++) {
      setBlock(dim, sandX, floorY + 1 + h, rz, "minecraft:reeds");
    }
  }
}

/**
 * Row 12: Bamboo – preventBase for bamboo, preventAlways for sapling.
 * 3 columns (height 1, 2, 3) on dirt, 2 blocks apart; sapling placed at offset +7.
 */
function rowBamboo(dim, ox, rz, floorY) {
  for (let col = 0; col < 3; col++) {
    const x = ox + col * 2;
    setBlock(dim, x, floorY, rz, "minecraft:dirt");
    for (let h = 0; h <= col; h++) {
      setBlock(dim, x, floorY + 1 + h, rz, "minecraft:bamboo");
    }
  }
  setBlock(dim, ox + 7, floorY,     rz, "minecraft:dirt");
  setBlock(dim, ox + 7, floorY + 1, rz, "minecraft:bamboo_sapling");
}

/**
 * Row 13: Cactus – preventBase.
 * 3 columns (height 1, 2, 3) on sand, 2 blocks apart to avoid adjacency issues.
 */
function rowCactus(dim, ox, rz, floorY) {
  for (let col = 0; col < 3; col++) {
    const x = ox + col * 2;
    setBlock(dim, x, floorY, rz, "minecraft:sand");
    for (let h = 0; h <= col; h++) {
      setBlock(dim, x, floorY + 1 + h, rz, "minecraft:cactus");
    }
  }
}

/** Row 14: Bare farmland – preventAlways, no crops. */
function rowFarmland(dim, ox, rz, floorY) {
  for (let i = 0; i < 5; i++) {
    setBlock(dim, ox + i, floorY, rz, "minecraft:farmland");
  }
}

// ─── Item giving ──────────────────────────────────────────────────────────────

function giveItems(player) {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;

  const tools = [...new Set(TOOL_GROUPS.flat())];
  for (const typeId of tools) {
    try { container.addItem(new ItemStack(typeId, 1)); }
    catch (e) { logHG(`give ${typeId}: ${e}`, TAG, true, true); }
  }
  try { container.addItem(new ItemStack("minecraft:bone_meal", 64)); }
  catch (e) { logHG(`give bone_meal: ${e}`, TAG, true, true); }
}

// ─── Build orchestration ──────────────────────────────────────────────────────

function buildEnvironment(player) {
  const dim    = player.dimension;
  const ox     = Math.floor(player.location.x) + 2;
  const oz     = Math.floor(player.location.z) + 2;
  // Use player's current surface level; y=65 is the recommended standing height.
  const floorY = Math.round(player.location.y) - 1;

  const ROW_BUILDERS = [
    (rz) => rowGrowthCrop(dim, ox, rz, floorY, "minecraft:wheat"),       // Row 1
    (rz) => rowGrowthCrop(dim, ox, rz, floorY, "minecraft:carrots"),     // Row 2
    (rz) => rowGrowthCrop(dim, ox, rz, floorY, "minecraft:potatoes"),    // Row 3
    (rz) => rowGrowthCrop(dim, ox, rz, floorY, "minecraft:beetroot"),    // Row 4
    (rz) => rowNetherWart(dim, ox, rz, floorY),                          // Row 5
    (rz) => rowCocoa(dim, ox, rz, floorY),                               // Row 6
    (rz) => rowMelonStem(dim, ox, rz, floorY),                           // Row 7
    (rz) => rowPumpkinStem(dim, ox, rz, floorY),                         // Row 8
    (rz) => rowSweetBerry(dim, ox, rz, floorY),                          // Row 9
    (rz) => rowCaveVines(dim, ox, rz, floorY),                           // Row 10
    (rz) => rowSugarCane(dim, ox, rz, floorY),                           // Row 11
    (rz) => rowBamboo(dim, ox, rz, floorY),                              // Row 12
    (rz) => rowCactus(dim, ox, rz, floorY),                              // Row 13
    (rz) => rowFarmland(dim, ox, rz, floorY),                            // Row 14
  ];

  const TOTAL_DEPTH = ROW_BUILDERS.length * 2 + 2; // extra margin at the end

  // Phase 1 – clear area one z-slice per tick (keeps each tick lightweight).
  // dz=-1 starts at tick 2; dz=TOTAL_DEPTH-1 finishes at tick 2+TOTAL_DEPTH.
  for (let dz = -1; dz < TOTAL_DEPTH; dz++) {
    const sliceDz = dz;
    system.runTimeout(() => {
      try { clearSlice(dim, ox, oz + sliceDz, floorY); }
      catch (e) { logHG(`clearSlice dz=${sliceDz}: ${e}`, TAG, true, true); }
    }, 3 + sliceDz); // dz=-1 → tick 2
  }

  // Phase 2 – place rows, 5 ticks apart, after clearing is done.
  const P2_START = 3 + TOTAL_DEPTH + 5;
  ROW_BUILDERS.forEach((build, i) => {
    system.runTimeout(() => {
      try { build(oz + i * 2); }
      catch (e) { logHG(`row[${i}]: ${e}`, TAG, true, true); }
    }, P2_START + i * 5);
  });

  // Phase 3 – give items and send completion message.
  system.runTimeout(() => {
    try {
      giveItems(player);
      player.sendMessage("§a[HG Validation] Environment ready.");
    } catch (e) {
      logHG(`finalise: ${e}`, TAG, true, true);
    }
  }, P2_START + ROW_BUILDERS.length * 5 + 10);
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register the hg:validation script-event handler.
 * Called from main.js — see the DEV ONLY import comment there.
 */
export default function registerValidation() {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "hg:validation") return;
    try {
      const player = ev.sourceEntity;
      if (!player) { logHG("sourceEntity is null", TAG, true, true); return; }

      const settings = getSettings(player);
      if ((settings.debugLevelIndex ?? 0) <= 0) {
        player.sendMessage("§c[HG Validation] Enable Debug mode first (Settings → Debug Level: Basic).");
        return;
      }

      player.sendMessage("§e[HG Validation] Building environment…");
      logHG(`triggered by ${player.name}`, TAG);
      buildEnvironment(player);
    } catch (e) {
      logHG(`handler error: ${e}`, TAG, true, true);
    }
  });
}
