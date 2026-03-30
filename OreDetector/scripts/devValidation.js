/**
 * Ore Location Detector — DEV ONLY validation environment.
 *
 * Trigger: /scriptevent od:validation   (requires Debug Level = Basic)
 *
 * Creates a flat testing area around the player:
 *   1. Flattens a 65×65 area at the player's Y level (replaced with air).
 *   2. Lays a stone floor one block below the player.
 *   3. Places one ore block per ORE_LIST entry at varying distances/directions.
 *   4. Gives the player one of every pickaxe in PICKAXE_GROUPS[0].types.
 *
 * IMPORTANT: remove the import of this file from main.js before publishing.
 */

import { system, ItemStack, BlockVolume } from "@minecraft/server";
import { ORE_LIST }      from "./data/ore_list.js";
import { PICKAXE_GROUPS } from "./data/pickaxe_groups.js";
import { logOD, getSettings } from "./settingsManager.js";

const TAG = "od:validation";

// 32 blocks each side → 65×65 area, spans a 5×5 chunk grid (25 chunks).
// Must be ≥ max(DISTANCES) so all ore blocks land inside the cleared area.
const FLATTEN_RADIUS = 32;

// Distances (blocks) assigned to each ore slot, cycling if ORE_LIST grows.
const DISTANCES = [5, 15, 25, 30, 5, 15, 25, 30, 5];

export default function registerValidation(sourceEntity) {
  try {
    const settings = getSettings(sourceEntity);
    if (settings.debug?.level !== "basic") {
      sourceEntity.sendMessage("§c[OreDetector DEV] Validation requires Debug Level set to Basic.");
      return;
    }
    buildValidationEnv(sourceEntity);
  } catch (e) {
    logOD(`od:validation error: ${e}`, TAG, true, true);
    sourceEntity.sendMessage(`§c[OreDetector DEV] Failed: ${e}`);
  }
}

// ─── Environment builder ──────────────────────────────────────────────────────

function buildValidationEnv(player) {
  const dim = player.dimension;
  const loc = player.location;
  const px  = Math.floor(loc.x);
  const py  = Math.floor(loc.y);
  const pz  = Math.floor(loc.z);

  // ── Step 1: clear air layer by layer ────────────────────────────────────────
  // fillBlocks limit = 32,768 blocks. 65×65×7 = 29,575 would fit in one call,
  // but a 65×65 area can still touch unloaded edge chunks. Filling one Y layer
  // at a time (65×65 = 4,225 each) lets us skip any layer that hits an unloaded
  // chunk without aborting the entire setup.
  let fillWarnings = 0;
  for (let dy = 0; dy <= 6; dy++) {
    try {
      dim.fillBlocks(
        new BlockVolume(
          { x: px - FLATTEN_RADIUS, y: py + dy, z: pz - FLATTEN_RADIUS },
          { x: px + FLATTEN_RADIUS, y: py + dy, z: pz + FLATTEN_RADIUS },
        ),
        "minecraft:air",
      );
    } catch (e) {
      fillWarnings++;
      logOD(`air fill dy=${dy} skipped: ${e}`, TAG, true);
    }
  }

  // ── Step 2: solid stone floor one block below player feet ───────────────────
  try {
    dim.fillBlocks(
      new BlockVolume(
        { x: px - FLATTEN_RADIUS, y: py - 1, z: pz - FLATTEN_RADIUS },
        { x: px + FLATTEN_RADIUS, y: py - 1, z: pz + FLATTEN_RADIUS },
      ),
      "minecraft:stone",
    );
  } catch (e) {
    fillWarnings++;
    logOD(`floor fill skipped: ${e}`, TAG, true);
  }

  // ── Step 3: place one ore block per ORE_LIST entry ─────────────────────────
  // Ores float at py+1 (eye level), spread evenly around the player in a circle.
  const oreY = py + 1;
  ORE_LIST.forEach((ore, i) => {
    const angle = (i / ORE_LIST.length) * 2 * Math.PI; // evenly spaced, full circle
    const dist  = DISTANCES[i % DISTANCES.length];
    const bx    = Math.round(px + Math.sin(angle) * dist);
    const bz    = Math.round(pz + Math.cos(angle) * dist);
    try {
      dim.setBlockType({ x: bx, y: oreY, z: bz }, ore.blockIds[0]);
    } catch (e) {
      logOD(`place ${ore.key} failed: ${e}`, TAG, true);
    }
  });

  // ── Step 4: give pickaxes + confirm (wait a tick for block writes to settle) ─
  const warnings = fillWarnings;
  system.runTimeout(() => {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (container) {
      for (const typeId of PICKAXE_GROUPS[0].types) {
        try {
          container.addItem(new ItemStack(typeId, 1));
        } catch (e) {
          logOD(`give ${typeId} failed: ${e}`, TAG, true);
        }
      }
    }

    const oreNames = ORE_LIST.map(o => `${o.color}${o.label}§r`).join("§f, ");
    const lines = [
      `§a[OreDetector DEV] Validation environment ready!`,
      `§7Ores placed: §f${oreNames}`,
      `§7Distances: §f${[...new Set(DISTANCES.slice(0, ORE_LIST.length))].join(", ")} blocks`,
      `§7Hold any pickaxe to test the HUD.`,
    ];
    if (warnings > 0) {
      lines.push(`§e§o(${warnings} fill layer(s) skipped — unloaded chunks at area edge)`);
    }
    player.sendMessage(lines.join("\n"));

    logOD(`validation env built at ${px},${py},${pz} for ${player.name} (fillWarnings=${warnings})`, TAG);
  }, 2);
}
