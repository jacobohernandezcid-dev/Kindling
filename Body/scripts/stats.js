import {
  AGILITY_K,
  COST,
  HUNGER_LOCK_START,
  HUNGER_MAX_LOCK,
  HP_BASE,
  HP_BONUS_MAX,
  HP_REGEN_PER_SEC_AT_BASE,
  ANALOG_IDLE,
  INSOMNIA_FLOOR,
  INSOMNIA_GROWTH,
  INSOMNIA_MAX_DAYS,
  REGEN_K,
  REGEN_PER_SEC_BASE,
  RESIST_CAP,
  STAMINA_MAX_BASE,
  STAMINA_MAX_VITALITY_BONUS,
  STRENGTH_FLOOR,
  STRENGTH_FULL_UNTIL,
  STRENGTH_K,
  TICKS_PER_SECOND,
  VITALITY_K,
  WALK_MAX_REGEN_SHARE,
} from "./config.js";

export function scale(bonus, k) {
  if (bonus <= 0) {
    return 0;
  }
  return bonus / (bonus + k);
}

export function unrestMultiplier(days) {
  const d = Math.min(INSOMNIA_MAX_DAYS, Math.max(0, days));
  return INSOMNIA_FLOOR + (1 - INSOMNIA_FLOOR) * (1 / (1 + INSOMNIA_GROWTH * d));
}

export function hungerFoodFraction(player) {
  try {
    const hunger =
      player.getComponent("minecraft:player.hunger") || player.getComponent("minecraft:hunger");
    if (!hunger) {
      return 1;
    }
    const max = hunger.effectiveMax || 20;
    return Math.max(0, Math.min(1, hunger.currentValue / max));
  } catch {
    return 1;
  }
}

/** Locked fraction of stamina max. Food 1 = full vanilla bar. */
export function lockedFraction(food) {
  if (food > HUNGER_LOCK_START) {
    return 0;
  }
  return Math.min(HUNGER_MAX_LOCK, HUNGER_LOCK_START - food);
}

export function maxStaminaAfterInsomnia(insomniaDays, vitalityBonus = 0) {
  const fromVitality =
    STAMINA_MAX_BASE * (1 + STAMINA_MAX_VITALITY_BONUS * scale(vitalityBonus, VITALITY_K));
  return fromVitality * unrestMultiplier(insomniaDays);
}

export function staminaCaps(food, insomniaDays, vitalityBonus = 0) {
  const max = maxStaminaAfterInsomnia(insomniaDays, vitalityBonus);
  const locked = lockedFraction(food) * max;
  const available = Math.max(max * (1 - HUNGER_MAX_LOCK), max - locked);
  return { max, locked, available };
}

export function staminaFactor(current, available) {
  if (available <= 0) {
    return STRENGTH_FLOOR;
  }
  const r = current / available;
  if (r >= STRENGTH_FULL_UNTIL) {
    return 1;
  }
  return STRENGTH_FLOOR + (1 - STRENGTH_FLOOR) * (r / STRENGTH_FULL_UNTIL);
}

export function derivedStats(bonuses, food, insomniaDays, currentStamina) {
  const unrest = unrestMultiplier(insomniaDays);
  const caps = staminaCaps(food, insomniaDays, bonuses.vitality);
  const stamF = staminaFactor(currentStamina, caps.available);
  const a = bonuses.agility;
  const s = bonuses.strength;
  const regenBonus = bonuses.regenBonus;

  const speedMult = unrest * (1 + 0.2 * scale(a, AGILITY_K));
  const moveCostMult = (1 - 0.4 * scale(a, AGILITY_K)) / unrest;
  const meleeMult = unrest * stamF * (1 + 0.35 * scale(s, STRENGTH_K));
  const mineMult = unrest * stamF * (1 + 0.2 * scale(s, STRENGTH_K));
  const regenPerSec =
    REGEN_PER_SEC_BASE * unrest * (1 + 1.0 * scale(regenBonus, REGEN_K));
  const maxHp = HP_BASE + HP_BONUS_MAX * scale(bonuses.vitality, VITALITY_K);
  const hpRegenPerSec =
    currentStamina >= caps.available - 0.01 && lockedFraction(food) === 0 && food >= 0.999
      ? HP_REGEN_PER_SEC_AT_BASE * (regenPerSec / REGEN_PER_SEC_BASE)
      : 0;

  return {
    unrest,
    caps,
    stamF,
    speedMult,
    moveCostMult: Math.min(2.5, Math.max(0.6, moveCostMult)),
    meleeMult,
    mineMult,
    regenPerTick: regenPerSec / TICKS_PER_SECOND,
    maxHp,
    hpRegenPerTick: hpRegenPerSec / TICKS_PER_SECOND,
    fireRes: Math.min(RESIST_CAP, Math.max(0, bonuses.fireRes)),
    heatRes: Math.min(RESIST_CAP, Math.max(0, bonuses.heatRes)),
    coldRes: Math.min(RESIST_CAP, Math.max(0, bonuses.coldRes)),
    poisonRes: Math.min(RESIST_CAP, Math.max(0, bonuses.poisonRes)),
  };
}

/**
 * Crouch / walk cost from stick or key strength. Keyboard is always full
 * strength; a console stick scales smoothly from crouch cost to walk cost.
 * Capped below regen so walking always recovers stamina.
 */
export function walkCostPerTick(gait, mag, moveCostMult, regenPerTick) {
  const t = Math.min(1, Math.max(0, (mag - ANALOG_IDLE) / (1 - ANALOG_IDLE)));
  const top = gait === "sneak" ? COST.sneak : COST.walk;
  const base = COST.sneak + (top - COST.sneak) * t;
  return Math.min(base * moveCostMult, regenPerTick * WALK_MAX_REGEN_SHARE);
}

export function gaitCostPerTick(gait, moveCostMult, mag = 1, regenPerTick = 0) {
  if (gait === "walk" || gait === "sneak") {
    return walkCostPerTick(gait, mag, moveCostMult, regenPerTick);
  }
  const base =
    gait === "swimSprint"
      ? COST.swimSprint
      : gait === "swim"
        ? COST.swim
        : gait === "wade"
          ? COST.wade
          : gait === "sprint"
            ? COST.sprint
            : 0;
  return base * moveCostMult;
}
