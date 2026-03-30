/**
 * Ore Location Detector — main entry point.
 *
 * While a player holds any pickaxe, scans for nearby ores within SCAN_RADIUS
 * and shows a live action-bar HUD with direction and distance to the nearest
 * ore of each type. Clears the HUD when the pickaxe is put away.
 */

import { world, system, EquipmentSlot, BlockVolume } from "@minecraft/server";
import { PICKAXE_TYPES }  from "./data/pickaxe_types.js";
import { ORE_LIST }       from "./data/ore_list.js";
import { logOD, getSettings, saveSettings, clearPlayerCache, cloneDefaultSettings } from "./settingsManager.js";
import registerValidation from "./devValidation.js"; // DEV ONLY – remove before publishing

// ─── Key constants ────────────────────────────────────────────────────────────

/** How often the HUD refreshes (1 = every tick). */
const SCAN_INTERVAL_TICKS = 1;

/** Sphere radius around the player to scan for ores (blocks). */
const SCAN_RADIUS = 32;

// ─── Derived constants ────────────────────────────────────────────────────────

/** Flat list of all ore block IDs — used as the includeTypes filter. */
const ALL_ORE_IDS = ORE_LIST.flatMap(ore => ore.blockIds);

/** Map from block typeId → index in ORE_LIST (avoids repeated findIndex). */
const ORE_TYPE_INDEX = new Map(
  ORE_LIST.flatMap((ore, i) => ore.blockIds.map(id => [id, i]))
);

/** Arrow characters for the 8 compass directions, clockwise from North (index 0). */
const COMPASS_ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/** Player IDs currently showing the HUD — used to avoid clearing unnecessarily. */
const activeHudPlayers = new Set();

// ─── Scan cache (position-driven) ────────────────────────────────────────────
// The block scan is expensive. We only re-scan when the player steps into a
// new block. Arrow rendering stays live every tick (getViewDirection is cheap).

/** playerId → last scanned block position {x, y, z} (integer coords) */
const lastScanBlockPos = new Map();

/** playerId → last scan results (the `found` array from scanOres) */
const lastScanResults  = new Map();

// ─── Usage message ────────────────────────────────────────────────────────────

const USAGE_MESSAGE = [
  "§b[OreDetector] Commands:",
  "  §f/scriptevent od:settings§7  — settings (stub, UI coming soon)",
  "  §f/scriptevent od:active <true|false>§7  — enable or disable",
  "  §f/scriptevent od:restore§7  — reset to defaults",
].join("\n");

// ─── Main HUD loop ────────────────────────────────────────────────────────────

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      updateHud(player);
    } catch (e) {
      logOD(`HUD error: ${stringifyError(e)}`, "hud", true, true);
    }
  }
}, SCAN_INTERVAL_TICKS);

// ─── Event hooks ──────────────────────────────────────────────────────────────

if (world.afterEvents?.playerLeave?.subscribe) {
  world.afterEvents.playerLeave.subscribe((ev) => {
    clearPlayerCache(ev.playerId);
    activeHudPlayers.delete(ev.playerId);
    lastScanBlockPos.delete(ev.playerId);
    lastScanResults.delete(ev.playerId);
    logOD(`cache cleared for ${ev.playerId}`, "playerLeave");
  });
}

if (system.afterEvents?.scriptEventReceive?.subscribe) {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    try {
      const source = ev.sourceEntity;
      if (!source || source.typeId !== "minecraft:player") return;

      const args = (ev.message ?? "").trim().split(/\s+/).filter(x => x.length > 0);

      if (ev.id === "od:active")     { handleOdActive(source, args); return; }
      if (ev.id === "od:restore")    { handleOdRestore(source);      return; }
      if (ev.id === "od:settings") {
        source.sendMessage("§b[OreDetector] Settings UI coming soon.\nUse §f/scriptevent od:active true/false§b to toggle.");
        return;
      }
      if (ev.id === "od:validation") { /* DEV ONLY – remove before publishing */
        registerValidation(source); return;
      }
      if (ev.id.startsWith("od:")) {
        system.runTimeout(() => source.sendMessage(USAGE_MESSAGE), 2);
        return;
      }
    } catch (e) {
      logOD(`scriptEvent error: ${stringifyError(e)}`, "scriptEvent", true, true);
    }
  });
}

// ─── Command handlers ─────────────────────────────────────────────────────────

function handleOdActive(player, args) {
  try {
    if (!args || args.length < 1) { player.sendMessage(USAGE_MESSAGE); return; }
    const active = parseBool(args[0]);
    if (typeof active !== "boolean") { player.sendMessage(USAGE_MESSAGE); return; }

    const settings = getSettings(player);
    settings.enabled = active;
    if (!saveSettings(player, settings)) {
      player.sendMessage("§c[OreDetector] Failed to save settings.");
      return;
    }
    player.sendMessage(`§b[OreDetector] ${active ? "§aEnabled" : "§cDisabled"}`);
  } catch (e) {
    logOD(`handleOdActive: ${stringifyError(e)}`, "od:active", true, true);
    player.sendMessage("§c[OreDetector] Failed to update. See log.");
  }
}

function handleOdRestore(player) {
  try {
    const settings = cloneDefaultSettings();
    if (!saveSettings(player, settings)) {
      player.sendMessage("§c[OreDetector] Restore failed.");
      return;
    }
    player.sendMessage("§b[OreDetector] Restored default settings.");
  } catch (e) {
    logOD(`handleOdRestore: ${stringifyError(e)}`, "od:restore", true, true);
    player.sendMessage("§c[OreDetector] Failed to restore. See log.");
  }
}

// ─── HUD logic ────────────────────────────────────────────────────────────────

/**
 * Checks what the player is holding, scans for ores if holding a pickaxe,
 * and updates (or clears) the action-bar HUD.
 *
 * @param {import("@minecraft/server").Player} player
 */
function updateHud(player) {
  const settings = getSettings(player);

  const equippable = player.getComponent("minecraft:equippable");
  const heldItem   = equippable?.getEquipment(EquipmentSlot.Mainhand);
  const holdingPickaxe = heldItem != null && PICKAXE_TYPES.includes(heldItem.typeId);

  if (!holdingPickaxe || !settings.enabled) {
    if (activeHudPlayers.has(player.id)) {
      player.onScreenDisplay.setActionBar(" ");
      activeHudPlayers.delete(player.id);
    }
    // Clear scan cache so next pickup triggers a fresh scan immediately.
    lastScanBlockPos.delete(player.id);
    lastScanResults.delete(player.id);
    return;
  }

  // Re-scan only when the player steps into a new block.
  // Arrow recalculation (getViewDirection) still runs every tick — it's cheap.
  const loc = player.location;
  const bx = Math.floor(loc.x), by = Math.floor(loc.y), bz = Math.floor(loc.z);
  const lastPos = lastScanBlockPos.get(player.id);
  let found;
  if (!lastPos || lastPos.x !== bx || lastPos.y !== by || lastPos.z !== bz) {
    found = scanOres(player);
    lastScanResults.set(player.id, found);
    lastScanBlockPos.set(player.id, { x: bx, y: by, z: bz });
  } else {
    found = lastScanResults.get(player.id) ?? [];
  }

  if (found.length === 0) {
    player.onScreenDisplay.setActionBar("§7No ores within " + SCAN_RADIUS + " blocks.");
    activeHudPlayers.add(player.id);
    return;
  }

  const playerYaw = player.getRotation().y;
  const lines = [...found]
    .sort((a, b) => a.dist - b.dist)
    .map(({ ore, dist, dx, dz }) => {
      const arrow = getCompassArrow(dx, dz, playerYaw);
      return `${ore.color}◆ ${ore.label} §f${arrow} ${Math.round(dist)} blocks`;
    });

  player.onScreenDisplay.setActionBar(lines.join("\n"));
  activeHudPlayers.add(player.id);
}

// ─── Ore scanner ──────────────────────────────────────────────────────────────

/**
 * Scans for the nearest ore of each type within a sphere of SCAN_RADIUS.
 *
 * @param {import("@minecraft/server").Player} player
 * @returns {{ ore: object, dist: number, dx: number, dz: number }[]}
 *          One entry per found ore type, in ORE_LIST display order.
 */
function scanOres(player) {
  const loc = player.location;
  const dim = player.dimension;

  const from = {
    x: Math.floor(loc.x) - SCAN_RADIUS,
    y: Math.max(-64,  Math.floor(loc.y) - SCAN_RADIUS),
    z: Math.floor(loc.z) - SCAN_RADIUS,
  };
  const to = {
    x: Math.floor(loc.x) + SCAN_RADIUS,
    y: Math.min(320, Math.floor(loc.y) + SCAN_RADIUS),
    z: Math.floor(loc.z) + SCAN_RADIUS,
  };

  const blockResults = dim.getBlocks(new BlockVolume(from, to), { includeTypes: ALL_ORE_IDS }, true);

  // nearest[i] = { dist, dx, dz } for ORE_LIST index i, or null if not found yet.
  const nearest = new Array(ORE_LIST.length).fill(null);

  for (const blockLoc of blockResults.getBlockLocationIterator()) {
    // Centre of the block for a more accurate distance.
    const dx   = blockLoc.x + 0.5 - loc.x;
    const dy   = blockLoc.y + 0.5 - loc.y;
    const dz   = blockLoc.z + 0.5 - loc.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // True sphere check (BlockVolume is a bounding box, not a sphere).
    if (dist > SCAN_RADIUS) continue;

    const block = dim.getBlock(blockLoc);
    if (!block) continue;

    const oreIndex = ORE_TYPE_INDEX.get(block.typeId);
    if (oreIndex === undefined) continue;

    if (nearest[oreIndex] === null || dist < nearest[oreIndex].dist) {
      nearest[oreIndex] = { dist, dx, dz };
    }
  }

  // Return found ores in ORE_LIST display order.
  const found = [];
  for (let i = 0; i < ORE_LIST.length; i++) {
    if (nearest[i] !== null) {
      found.push({ ore: ORE_LIST[i], ...nearest[i] });
    }
  }
  return found;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a single arrow relative to the player's current facing direction.
 *   ↑ = straight ahead, ↓ = behind, → = turn right, ← = turn left, etc.
 *
 * Bedrock yaw: 0° = South, −90° = East, 90° = West, 180°/−180° = North.
 * angleToOre uses 0° = North (atan2(dx, −dz)), so we convert playerYaw to
 * the same system by adding 180° before subtracting.
 *
 * @param {number} dx         ore.x − player.x
 * @param {number} dz         ore.z − player.z
 * @param {number} playerYaw  player.getRotation().y
 */
function getCompassArrow(dx, dz, playerYaw) {
  // Angle to ore in world space — 0° = North (−Z), clockwise positive.
  const angleToOre  = Math.atan2(dx, -dz) * (180 / Math.PI);
  // Convert Bedrock yaw (0° = South) to same North-origin system.
  const facingAngle = playerYaw + 180;
  // Relative angle: positive = clockwise = right of player.
  let relative = angleToOre - facingAngle;
  // Normalise to [0, 360).
  relative = ((relative % 360) + 360) % 360;
  // 8 sectors of 45°; Math.round centres each arrow on its sector.
  const index = Math.round(relative / 45) % 8;
  return COMPASS_ARROWS[index];
}

function parseBool(value) {
  const v = String(value).trim().toLowerCase();
  if (v === "true"  || v === "1" || v === "on"  || v === "yes") return true;
  if (v === "false" || v === "0" || v === "off" || v === "no")  return false;
  return undefined;
}

function stringifyError(error) {
  try {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  } catch { return "Unknown error"; }
}
