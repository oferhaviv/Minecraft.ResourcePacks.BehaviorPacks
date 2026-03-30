/**
 * Deep Dark Survival Kit — main entry point.
 *
 * Feature: continuous particle indicator above nearby hostile mobs.
 * Runs every tick so the marker stays visible in dark areas.
 */

import { world, system } from "@minecraft/server";

// Run every tick for a continuous, solid-looking indicator.
const SCAN_INTERVAL_TICKS = 1;

// Horizontal radius around each player to scan for mobs.
const SCAN_RADIUS = 32;

// Particle spawned above each hostile mob.
const MOB_PARTICLE = "minecraft:basic_portal_particle";

// How many blocks tall the indicator beam rises above the mob.
const BEAM_HEIGHT = 10;

// Gap between each particle in the column (blocks). Smaller = denser.
const BEAM_STEP = 0.5;

// Entity types to mark.
const HOSTILE_TYPES = [
  "minecraft:skeleton",
  "minecraft:zombie",
];

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      drawIndicatorsAboveHostiles(player);
    } catch (e) {
      console.warn(`[DDSK] error: ${e}`);
    }
  }
}, SCAN_INTERVAL_TICKS);

/**
 * @param {import("@minecraft/server").Player} player
 */
function drawIndicatorsAboveHostiles(player) {
  const dim = player.dimension;

  // getEntities doesn't support multiple types in one call, so query each type.
  const allHostiles = HOSTILE_TYPES.flatMap((type) =>
    dim.getEntities({ location: player.location, maxDistance: SCAN_RADIUS, type })
  );

  for (const entity of allHostiles) {
    if (!entity.isValid) continue;

    const loc = entity.location;
    // Start beam at entity's eye level (approx +1.6 for zombie/skeleton).
    const baseY = loc.y + 1.6;

    for (let dy = 0; dy <= BEAM_HEIGHT; dy += BEAM_STEP) {
      dim.spawnParticle(MOB_PARTICLE, { x: loc.x, y: baseY + dy, z: loc.z });
    }
  }
}
