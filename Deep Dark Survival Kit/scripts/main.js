/**
 * Deep Dark Survival Kit — main entry point.
 *
 * Feature: continuous particle beam above nearby chests.
 * Runs every tick so the column stays solid and visible in dark areas.
 */

import { world, system, BlockVolume } from "@minecraft/server";

// Run every tick for a continuous, solid-looking beam.
const SCAN_INTERVAL_TICKS = 1;

// Horizontal/vertical radius around each player to scan for chests.
const SCAN_RADIUS = 32;

// Particle used for each step of the beam column.
// minecraft:basic_flame_particle is bright orange — visible in dark areas.
const BEAM_PARTICLE = "minecraft:basic_portal_particle";

// How many blocks tall the beam rises above the chest top.
const BEAM_HEIGHT = 20;

// Gap between each particle in the column (blocks). Smaller = denser.
const BEAM_STEP = 0.5;

const CHEST_TYPES = [
  "minecraft:chest",
  "minecraft:trapped_chest",
  "minecraft:ender_chest",
];

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      drawBeamsAboveChests(player);
    } catch (e) {
      console.warn(`[DDSK] error: ${e}`);
    }
  }
}, SCAN_INTERVAL_TICKS);

/**
 * @param {import("@minecraft/server").Player} player
 */
function drawBeamsAboveChests(player) {
  const loc = player.location;
  const dim = player.dimension;

  const from = {
    x: Math.floor(loc.x) - SCAN_RADIUS,
    y: Math.max(-64,  Math.floor(loc.y) - SCAN_RADIUS),
    z: Math.floor(loc.z) - SCAN_RADIUS,
  };
  const to = {
    x: Math.floor(loc.x) + SCAN_RADIUS,
    y: Math.min(320,  Math.floor(loc.y) + SCAN_RADIUS),
    z: Math.floor(loc.z) + SCAN_RADIUS,
  };

  const results = dim.getBlocks(new BlockVolume(from, to), { includeTypes: CHEST_TYPES }, true);

  for (const blockLoc of results.getBlockLocationIterator()) {
    const cx = blockLoc.x + 0.5;
    const cz = blockLoc.z + 0.5;
    const baseY = blockLoc.y + 1; // just above chest top

    for (let dy = 0; dy <= BEAM_HEIGHT; dy += BEAM_STEP) {
      dim.spawnParticle(BEAM_PARTICLE, { x: cx, y: baseY + dy, z: cz });
    }
  }
}
