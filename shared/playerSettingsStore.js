/**
 * Generic per-player settings store backed by Bedrock dynamic properties.
 *
 * Usage (once per pack, in settingsManager.js or equivalent):
 *
 *   import { createPlayerSettingsStore } from "./shared/playerSettingsStore.js";
 *   const store = createPlayerSettingsStore({ keyPrefix, defaults, merge });
 *
 * The store maintains an in-memory cache (Map<playerId, settings>) so that
 * getDynamicProperty is only called on the first access per session.
 * All reads return independent clones — callers cannot corrupt the cache.
 *
 * Error handling: both getSettings and saveSettings throw on failure.
 * The pack-level wrapper (settingsManager.js) is responsible for catching
 * and logging errors with its own logger.
 *
 * @param {object}                    options
 * @param {string}                    options.keyPrefix  Dynamic property key prefix;
 *                                                       player.id is appended automatically.
 * @param {object}                    options.defaults   Default settings (deep-cloned on use).
 * @param {(saved: object) => object} options.merge      Merges a persisted settings object into
 *                                                       a fresh copy of defaults; must return the
 *                                                       merged object.
 */
export function createPlayerSettingsStore({ keyPrefix, defaults, merge }) {
  const cache = new Map(); // playerId → settings object

  /** Deep-clone the defaults. */
  function cloneDefaults() {
    return JSON.parse(JSON.stringify(defaults));
  }

  /**
   * Returns a clone of the player's settings.
   * Populates the cache from the dynamic property on first call.
   * Caches the fallback defaults on error before re-throwing.
   */
  function getSettings(player) {
    if (cache.has(player.id)) {
      return JSON.parse(JSON.stringify(cache.get(player.id)));
    }

    try {
      const key = `${keyPrefix}_${player.id}`;
      const raw = player.getDynamicProperty(key);

      if (typeof raw !== "string" || raw.length === 0) {
        const d = cloneDefaults();
        cache.set(player.id, d);
        return cloneDefaults();
      }

      const parsed = JSON.parse(raw);
      const merged = merge(parsed);
      cache.set(player.id, merged);
      return JSON.parse(JSON.stringify(merged));
    } catch (e) {
      // Cache the fallback so repeated failures don't keep hitting storage.
      const fallback = cloneDefaults();
      if (player?.id) cache.set(player.id, fallback);
      throw e; // caller is responsible for logging
    }
  }

  /**
   * Persists settings via dynamic property and updates the cache.
   * Returns true on success, throws on failure.
   */
  function saveSettings(player, settings) {
    const key = `${keyPrefix}_${player.id}`;
    player.setDynamicProperty(key, JSON.stringify(settings));
    cache.set(player.id, settings);
    return true;
  }

  /** Remove a player's entry from the cache (call on playerLeave). */
  function clearPlayerCache(playerId) {
    cache.delete(playerId);
  }

  /**
   * Returns true if any cached player's settings satisfy predicate.
   * Used by the logger to check whether debug is active for any player.
   */
  function isAnyActive(predicate) {
    for (const s of cache.values()) {
      if (predicate(s)) return true;
    }
    return false;
  }

  return { getSettings, saveSettings, clearPlayerCache, cloneDefaults, isAnyActive };
}
