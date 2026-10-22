import { world } from "@minecraft/server";

/**
 * Dynamic properties are private to each behavior pack, so Kindling packs
 * share per-player numbers through scoreboard objectives instead.
 * Keep this file identical in Body and Climate.
 */
export const SHARED = {
  /** Written by Body. Sleepless days. */
  insomnia: "kl_insomnia",
  /** Written by Body. Resistance x100 (0-90). */
  heatRes: "kl_heatres",
  coldRes: "kl_coldres",
  /** Written by Climate. 0-100. */
  heat: "kl_heat",
  cold: "kl_cold",
};

function objective(id, create) {
  let o = world.scoreboard.getObjective(id);
  if (!o && create) {
    o = world.scoreboard.addObjective(id, id);
  }
  return o;
}

export function sharedExists(id) {
  try {
    return !!world.scoreboard.getObjective(id);
  } catch {
    return false;
  }
}

export function readShared(player, id, fallback = 0) {
  try {
    const o = objective(id, false);
    if (!o) {
      return fallback;
    }
    const v = o.getScore(player);
    return typeof v === "number" ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeShared(player, id, value) {
  try {
    objective(id, true).setScore(player, Math.round(value));
  } catch {
    /* scoreboard unavailable */
  }
}
