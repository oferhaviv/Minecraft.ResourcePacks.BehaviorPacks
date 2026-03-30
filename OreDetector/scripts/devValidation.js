/**
 * Ore Location Detector — DEV ONLY validation stub.
 *
 * Trigger: /scriptevent od:validation
 *
 * IMPORTANT: remove the import of this file from main.js before publishing.
 */

import { logOD } from "./settingsManager.js";

const TAG = "od:validation";

export default function registerValidation(sourceEntity) {
  try {
    logOD(`Validation triggered by ${sourceEntity.name ?? "unknown"}`, TAG);
    sourceEntity.sendMessage("§b[OreDetector DEV] Validation: hold a pickaxe to see the HUD. No automated test yet.");
  } catch (e) {
    logOD(`od:validation error: ${e}`, TAG, true, true);
    sourceEntity.sendMessage(`§c[OreDetector DEV] Failed: ${e}`);
  }
}
