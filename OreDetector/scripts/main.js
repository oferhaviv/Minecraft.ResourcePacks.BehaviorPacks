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
    return;
  }

  const found = scanOres(player);

  if (found.length === 0) {
    player.onScreenDisplay.setActionBar("§7No ores within " + SCAN_RADIUS + " blocks.");
    activeHudPlayers.add(player.id);
    return;
  }

  const view = player.getViewDirection(); // live forward vector, no yaw convention issues
  const lines = found.map(({ ore, dist, dx, dz }) => {
    const arrow = getCompassArrow(dx, dz, view.x, view.z);
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
 * Both ore direction and view direction are converted to angles using the same
 * atan2(−x, z) formula so any coordinate-convention differences cancel out.
 * Negating X makes clockwise rotation produce increasing angles, matching
 * Minecraft's layout (East/+X is to your LEFT when facing South/+Z).
 *
 * @param {number} dx   ore.x − player.x
 * @param {number} dz   ore.z − player.z
 * @param {number} vx   player.getViewDirection().x
 * @param {number} vz   player.getViewDirection().z
 */
function getCompassArrow(dx, dz, vx, vz) {
  const oreAngle  = Math.atan2(-dx, dz);   // angle toward ore
  const viewAngle = Math.atan2(-vx, vz);   // angle of player's forward vector
  let relAngle    = oreAngle - viewAngle;   // signed relative angle (radians)
  // Normalise to [0, 2π)
  relAngle = ((relAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const index = Math.round(relAngle / (Math.PI / 4)) % 8;  // 8 sectors of 45°
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
