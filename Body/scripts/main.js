import * as mc from "@minecraft/server";
import {
  ANALOG_IDLE,
  BOAT_TYPES,
  BURST,
  CART_TYPES,
  COLD_LEVELS,
  COST,
  DAY_TICKS,
  DP,
  EXHAUSTED_MOVE_SCALE,
  HEAT_LEVELS,
  HP_BASE,
  IDLE_REGEN_MULT,
  INSOMNIA_MAX_DAYS,
  MORNING_END,
  MORNING_START,
  STARVE_DAMAGE,
  VANILLA_MOVE,
  VEHICLE_MOVE_SPEED,
} from "./config.js";
import {
  derivedStats,
  gaitCostPerTick,
  hungerFoodFraction,
} from "./stats.js";
import {
  clampDanger,
  DANGER_DECAY_PER_SEC,
  DANGER_SLEEP_CUT,
  dangerKillAmount,
  tickDanger,
} from "./danger.js";
import { attachCommands } from "./commands.js";
import { readShared, SHARED, writeShared } from "./shared.js";

const world = mc.world;
const system = mc.system;
const GameMode = mc.GameMode;
const EntityDamageCause = mc.EntityDamageCause;
const JumpPerm = mc.InputPermissionCategory?.Jump ?? "Jump";

const memory = new Map();

function num(player, key, fallback = 0) {
  try {
    const v = player.getDynamicProperty(key);
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function setNum(player, key, value) {
  try {
    player.setDynamicProperty(key, value);
  } catch {
    /* ignore */
  }
}

function bonusesOf(player) {
  return {
    strength: num(player, DP.strength),
    agility: num(player, DP.agility),
    regenBonus: num(player, DP.regenBonus),
    vitality: num(player, DP.vitality),
    fireRes: num(player, DP.fireRes),
    heatRes: num(player, DP.heatRes),
    coldRes: num(player, DP.coldRes),
    poisonRes: num(player, DP.poisonRes),
  };
}

function mem(player) {
  let m = memory.get(player.id);
  if (!m) {
    m = {
      stamina: num(player, DP.stamina, 100),
      wasJumping: false,
      wasSleeping: false,
      drawing: false,
      miningTicks: 0,
      lastDay: -1,
      danger: clampDanger(num(player, DP.danger, 0)),
    };
    memory.set(player.id, m);
  }
  if (typeof m.danger !== "number" || !Number.isFinite(m.danger)) {
    m.danger = 0;
  }
  return m;
}

function entityValid(entity) {
  try {
    if (typeof entity.isValid === "function") {
      return entity.isValid();
    }
    return entity.isValid !== false;
  } catch {
    return false;
  }
}

function isPlayable(player) {
  try {
    const mode = String(player.getGameMode()).toLowerCase();
    return mode === "survival" || mode === "adventure" || mode === String(GameMode?.Survival).toLowerCase() || mode === String(GameMode?.Adventure).toLowerCase();
  } catch {
    return true;
  }
}

function hypot2(x, z) {
  return Math.sqrt(x * x + z * z);
}

function inputMag(player) {
  try {
    const v = player.inputInfo.getMovementVector();
    return hypot2(v.x, v.y);
  } catch {
    return player.isSprinting ? 1 : player.isSneaking ? 0.3 : 0.9;
  }
}

function riding(player) {
  try {
    const c = player.getComponent("minecraft:riding");
    return c?.entityRidingOn;
  } catch {
    return undefined;
  }
}

function vehicleSpeed(entity) {
  try {
    const v = entity.getVelocity();
    return hypot2(v.x, v.z);
  } catch {
    return 0;
  }
}

function classifyRide(typeId) {
  if (BOAT_TYPES.has(typeId)) {
    return "boat";
  }
  if (CART_TYPES.has(typeId) || typeId.includes("minecart")) {
    return "cart";
  }
  return "animal";
}

function blockIsWater(block) {
  if (!block) {
    return false;
  }
  try {
    if (block.isLiquid) {
      const id = block.typeId || "";
      return id.includes("water") || id.includes("bubble");
    }
  } catch {
    /* ignore */
  }
  try {
    const id = block.typeId || "";
    return id === "minecraft:water" || id === "minecraft:flowing_water" || id.includes("bubble_column");
  } catch {
    return false;
  }
}

/** True in water even when feet are on the seafloor (Bedrock then sets onGround and not isSwimming). */
function inWater(player) {
  try {
    if (player.isSwimming || player.isInWater) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const loc = player.location;
    const dim = player.dimension;
    const x = Math.floor(loc.x);
    const z = Math.floor(loc.z);
    if (blockIsWater(dim.getBlock({ x, y: Math.floor(loc.y), z }))) {
      return true;
    }
    if (blockIsWater(dim.getBlock({ x, y: Math.floor(loc.y + 0.8), z }))) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function isShallowWater(player) {
  if (!inWater(player)) {
    return false;
  }
  try {
    if (player.isSwimming) {
      return false;
    }
  } catch {
    /* ignore */
  }
  try {
    return !!player.isOnGround;
  } catch {
    return true;
  }
}

function onFootGait(player, mag) {
  const water = inWater(player);
  const shallow = isShallowWater(player);
  if (water && !shallow) {
    if (player.isSprinting) {
      return mag > ANALOG_IDLE ? "swimSprint" : "idle";
    }
    return mag > ANALOG_IDLE ? "swim" : "idle";
  }
  if (shallow) {
    return mag > ANALOG_IDLE ? "wade" : "idle";
  }
  if (mag <= ANALOG_IDLE) {
    return "idle";
  }
  if (player.isSprinting) {
    return "sprint";
  }
  return player.isSneaking ? "sneak" : "walk";
}

function isClimbingUp(player) {
  try {
    if (!player.isClimbing) {
      return false;
    }
    return player.getVelocity().y > 0.02;
  } catch {
    return false;
  }
}

function isBlocking(player) {
  try {
    if (!player.isSneaking) {
      return false;
    }
    const eq = player.getComponent("minecraft:equippable");
    return (
      eq?.getEquipment("Offhand")?.typeId === "minecraft:shield" ||
      eq?.getEquipment("Mainhand")?.typeId === "minecraft:shield"
    );
  } catch {
    return false;
  }
}

function spendForTick(player, stats) {
  const ride = riding(player);
  const mag = inputMag(player);
  const m = mem(player);
  let cost = 0;
  let gait = "idle";

  if (player.isGliding) {
    gait = "elytra";
    cost += COST.elytraGlide;
    try {
      const hand = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
      if (hand?.typeId === "minecraft:firework_rocket") {
        cost += COST.firework;
      }
    } catch {
      /* ignore */
    }
  } else if (ride) {
    const kind = classifyRide(ride.typeId);
    const moving = vehicleSpeed(ride) > VEHICLE_MOVE_SPEED || mag > ANALOG_IDLE;
    if (kind === "cart") {
      gait = moving ? "cart" : "idle";
      cost += moving ? COST.walk * stats.moveCostMult : 0;
    } else if (kind === "boat") {
      gait = moving ? "boat" : "idle";
      cost += moving ? COST.boatRow : 0;
    } else {
      gait = moving ? "animal" : "idle";
      cost += moving ? COST.animalMove : 0;
    }
  } else {
    gait = onFootGait(player, mag);
    if (gait !== "idle") {
      cost += gaitCostPerTick(gait, stats.moveCostMult, mag, stats.regenPerTick);
    }
    if (isClimbingUp(player)) {
      cost += COST.climb * stats.moveCostMult;
    }
    if (isBlocking(player)) {
      cost += COST.shield * stats.moveCostMult;
    }
  }

  const jumping = !!player.isJumping;
  if (jumping && !m.wasJumping && !ride && !player.isGliding) {
    cost += BURST.jump * stats.moveCostMult;
  }
  m.wasJumping = jumping;

  if (m.drawing) {
    cost += COST.bowDraw * stats.moveCostMult;
  }

  if (m.miningTicks > 0 && !ride && !player.isGliding) {
    cost += COST.mine * stats.moveCostMult;
    m.miningTicks -= 1;
  }

  return { cost, gait };
}

function clampStamina(player, stats, next) {
  const cap = stats.caps.available;
  return Math.max(0, Math.min(cap, next));
}

function applyMovement(player, stats, exhausted) {
  try {
    const move = player.getComponent("minecraft:movement");
    if (!move) {
      return;
    }
    const scale = stats.speedMult * (exhausted ? EXHAUSTED_MOVE_SCALE : 1);
    move.setCurrentValue(VANILLA_MOVE * scale);
  } catch {
    /* ignore */
  }
}

function applyExhaustedControls(player, exhausted, inWater) {
  try {
    const perms = player.inputPermissions;
    perms.setPermissionCategory(JumpPerm, !exhausted || !inWater);
  } catch {
    /* ignore */
  }
}

function applyMineSlow(player, stats, exhausted) {
  try {
    if (exhausted) {
      player.addEffect("mining_fatigue", 40, { amplifier: 2, showParticles: false });
      player.addEffect("slowness", 40, { amplifier: 2, showParticles: false });
      player.addEffect("weakness", 40, { amplifier: 1, showParticles: false });
      return;
    }
    if (stats.mineMult < 0.85) {
      const amp = stats.mineMult < 0.55 ? 1 : 0;
      player.addEffect("mining_fatigue", 30, { amplifier: amp, showParticles: false });
    } else {
      const fat = player.getEffect("mining_fatigue");
      if (fat && fat.amplifier <= 1) {
        player.removeEffect("mining_fatigue");
      }
    }
  } catch {
    /* ignore */
  }
}

function applyMaxHp(player, stats) {
  try {
    const extra = Math.round(stats.maxHp - HP_BASE);
    if (extra >= 4) {
      const amp = Math.min(4, Math.floor(extra / 4) - 1);
      player.addEffect("health_boost", 200, { amplifier: Math.max(0, amp), showParticles: false });
    }
  } catch {
    /* ignore */
  }
}

function regenHp(player, stats) {
  if (stats.hpRegenPerTick <= 0) {
    return;
  }
  try {
    const health = player.getComponent("minecraft:health");
    if (!health) {
      return;
    }
    const next = Math.min(health.effectiveMax, health.currentValue + stats.hpRegenPerTick);
    if (next > health.currentValue) {
      health.setCurrentValue(next);
    }
  } catch {
    /* ignore */
  }
}

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function staminaToken(current, available, max, climateTag = "") {
  const cap = Math.max(1, max);
  const cur = Math.max(0, Math.min(20, Math.round((current / cap) * 20)));
  const avail = Math.max(cur, Math.min(20, Math.round((available / cap) * 20)));
  return `k${pad2(20 - cur)}a${pad2(20 - avail)}${climateTag}`;
}

function levelOf(value, levels) {
  let n = 0;
  for (const at of levels) {
    if (value >= at) {
      n++;
    }
  }
  return n;
}

/** "", h1-h3 or c1-c3. Cold wins when both are set. */
function climateTag(player) {
  const c = levelOf(readShared(player, SHARED.cold), COLD_LEVELS);
  if (c > 0) {
    return `c${c}`;
  }
  const h = levelOf(readShared(player, SHARED.heat), HEAT_LEVELS);
  return h > 0 ? `h${h}` : "";
}

/** Publish Body numbers for other Kindling packs (once a second). */
function shareBody(player, m) {
  const bonus = bonusesOf(player);
  const next = [
    num(player, DP.insomniaDays),
    Math.round(Math.min(0.9, Math.max(0, bonus.heatRes)) * 100),
    Math.round(Math.min(0.9, Math.max(0, bonus.coldRes)) * 100),
  ];
  const prev = m.shared;
  if (prev && prev[0] === next[0] && prev[1] === next[1] && prev[2] === next[2]) {
    return;
  }
  writeShared(player, SHARED.insomnia, next[0]);
  writeShared(player, SHARED.heatRes, next[1]);
  writeShared(player, SHARED.coldRes, next[2]);
  m.shared = next;
}

function dangerTag(danger) {
  if (danger < 1) {
    return "";
  }
  return ` §c⚠${Math.floor(danger)}`;
}

let tickClock = 0;

function worldDay() {
  try {
    if (typeof world.getAbsoluteTime === "function") {
      return Math.floor(world.getAbsoluteTime() / DAY_TICKS);
    }
  } catch {
    /* ignore */
  }
  return Math.floor(tickClock / DAY_TICKS);
}

function isMorning() {
  try {
    const t = world.getTimeOfDay();
    return t >= MORNING_START || t < MORNING_END;
  } catch {
    return false;
  }
}

/** Only waking up in the morning (the night was slept through) counts as rest. */
function tickInsomnia(player, m) {
  const day = worldDay();
  const sleeping = !!player.isSleeping;
  if (!sleeping && m.wasSleeping && isMorning()) {
    setNum(player, DP.insomniaDays, 0);
    setNum(player, DP.lastSleepDay, day);
    m.danger = clampDanger(m.danger - DANGER_SLEEP_CUT);
    setNum(player, DP.danger, m.danger);
    try {
      player.sendMessage("§7You feel rested.");
    } catch {
      /* ignore */
    }
  }
  m.wasSleeping = sleeping;

  if (m.lastDay < 0) {
    m.lastDay = day;
    if (num(player, DP.lastSleepDay, -1) < 0) {
      setNum(player, DP.lastSleepDay, day);
    }
    return;
  }
  if (day > m.lastDay) {
    const lastSleep = num(player, DP.lastSleepDay, day);
    if (lastSleep < day) {
      setNum(
        player,
        DP.insomniaDays,
        Math.min(INSOMNIA_MAX_DAYS, num(player, DP.insomniaDays) + (day - m.lastDay))
      );
    }
    m.lastDay = day;
  }
}

function maybeStarve(player, food) {
  if (food > 0.001) {
    return;
  }
  const day = worldDay();
  const last = num(player, DP.lastStarveDay, -999);
  if (day === last) {
    return;
  }
  setNum(player, DP.lastStarveDay, day);
  try {
    player.applyDamage(STARVE_DAMAGE, { cause: EntityDamageCause.starve });
  } catch {
    /* ignore */
  }
}

function tickPlayer(player) {
  if (!entityValid(player) || !isPlayable(player)) {
    if (entityValid(player)) {
      try {
        player.inputPermissions.setPermissionCategory(JumpPerm, true);
      } catch {
        /* ignore */
      }
    }
    return;
  }

  const m = mem(player);
  tickInsomnia(player, m);
  const food = hungerFoodFraction(player);
  const insomniaDays = num(player, DP.insomniaDays);
  let stats = derivedStats(bonusesOf(player), food, insomniaDays, m.stamina);
  m.stamina = clampStamina(player, stats, m.stamina);
  stats = derivedStats(bonusesOf(player), food, insomniaDays, m.stamina);

  const { cost } = spendForTick(player, stats);
  // Resting recovers fast; acting uses base regen so sprint/mine still drain.
  const idle =
    cost < 0.001 && !(m.miningTicks > 0);
  const regen = idle ? stats.regenPerTick * IDLE_REGEN_MULT : stats.regenPerTick;
  const net = regen - cost;
  m.stamina = clampStamina(player, stats, m.stamina + net);
  setNum(player, DP.stamina, m.stamina);

  m.danger = clampDanger(m.danger - DANGER_DECAY_PER_SEC / 20);
  setNum(player, DP.danger, m.danger);
  const ride = riding(player);
  tickDanger(player, m.danger, ride?.id, tickClock);

  const exhausted = m.stamina <= 0.0001;
  applyMovement(player, stats, exhausted);
  applyExhaustedControls(player, exhausted, inWater(player));
  applyMineSlow(player, stats, exhausted);
  applyMaxHp(player, stats);
  regenHp(player, stats);
  maybeStarve(player, food);

  if (exhausted && inWater(player) && !riding(player)) {
    try {
      player.applyKnockback({ x: 0, z: 0 }, -0.08);
    } catch {
      try {
        player.applyImpulse({ x: 0, y: -0.04, z: 0 });
      } catch {
        /* ignore */
      }
    }
  }

  if (tickClock % 10 === 0 || m.climateTag === undefined) {
    m.climateTag = climateTag(player);
  }
  if (tickClock % 20 === 0) {
    shareBody(player, m);
  }

  try {
    player.onScreenDisplay.setActionBar(
      staminaToken(m.stamina, stats.caps.available, stats.caps.max, m.climateTag)
    );
  } catch {
    /* ignore */
  }
}

function resistForCause(cause, stats, hurtEntity) {
  if (
    cause === EntityDamageCause.fire ||
    cause === EntityDamageCause.fireTick ||
    cause === EntityDamageCause.lava ||
    cause === EntityDamageCause.magma ||
    cause === EntityDamageCause.campfire ||
    cause === EntityDamageCause.soulCampfire
  ) {
    return stats.fireRes;
  }
  if (cause === EntityDamageCause.freezing) {
    return stats.coldRes;
  }
  if (cause === EntityDamageCause.magic) {
    try {
      if (hurtEntity.getEffect("poison") || hurtEntity.getEffect("fatal_poison")) {
        return stats.poisonRes;
      }
    } catch {
      return 0;
    }
  }
  return 0;
}

function initWorld() {
  try {
    world.gameRules.naturalRegeneration = false;
    world.gameRules.doInsomnia = false;
  } catch {
    try {
      world.getDimension("overworld").runCommand("gamerule naturalregeneration false");
      world.getDimension("overworld").runCommand("gamerule doinsomnia false");
    } catch {
      /* ignore */
    }
  }
}

const greeted = new Set();

function greet(player) {
  if (!player || greeted.has(player.id)) {
    return;
  }
  greeted.add(player.id);
  try {
    player.sendMessage("§6Kindling Body §eloaded. §7Top XP-style bar = stamina. Type §e/kl:get §7or §e.k get");
  } catch {
    /* ignore */
  }
}

system.run(() => {
  try {
    world.sendMessage("§6Kindling Body §escripts running");
  } catch {
    /* ignore */
  }
  for (const player of world.getAllPlayers()) {
    greet(player);
  }
});

system.runInterval(() => {
  try {
    tickClock++;
    try {
      if (!world.getDynamicProperty("np:init")) {
        initWorld();
        world.setDynamicProperty("np:init", 1);
      }
    } catch {
      initWorld();
    }
    for (const player of world.getAllPlayers()) {
      try {
        greet(player);
        tickPlayer(player);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}, 1);

try {
  world.afterEvents.playerSpawn.subscribe((ev) => {
    const player = ev.player;
    const m = mem(player);
    greet(player);
    if (ev.initialSpawn) {
      const stored = num(player, DP.danger, -1);
      if (stored < 0) {
        m.danger = 0;
        setNum(player, DP.danger, 0);
      }
    }
    if (!ev.initialSpawn) {
      const food = hungerFoodFraction(player);
      const stats = derivedStats(bonusesOf(player), food, num(player, DP.insomniaDays), 100);
      m.stamina = stats.caps.available;
      setNum(player, DP.stamina, m.stamina);
    } else if (num(player, DP.stamina, -1) < 0) {
      m.stamina = 100;
      setNum(player, DP.stamina, 100);
    }
  });
} catch {
  /* API missing */
}

world.afterEvents.playerLeave.subscribe((ev) => {
  memory.delete(ev.playerId);
});

try {
  world.beforeEvents.entityHurt.subscribe((ev) => {
    const { hurtEntity, damageSource } = ev;
    if (damageSource.cause === EntityDamageCause.starve) {
      ev.cancel = true;
      return;
    }

    const attacker = damageSource.damagingEntity;
    if (attacker && attacker.typeId === "minecraft:player") {
      const am = memory.get(attacker.id);
      if (am && am.stamina <= 0.0001) {
        ev.cancel = true;
        return;
      }
      if (am && (damageSource.cause === EntityDamageCause.entityAttack || damageSource.cause === EntityDamageCause.projectile)) {
        const food = hungerFoodFraction(attacker);
        const stats = derivedStats(
          bonusesOf(attacker),
          food,
          num(attacker, DP.insomniaDays),
          am.stamina
        );
        ev.damage *= stats.meleeMult;
      }
    }

    if (hurtEntity.typeId === "minecraft:player") {
      const hm = memory.get(hurtEntity.id);
      const food = hungerFoodFraction(hurtEntity);
      const stats = derivedStats(
        bonusesOf(hurtEntity),
        food,
        num(hurtEntity, DP.insomniaDays),
        hm ? hm.stamina : num(hurtEntity, DP.stamina, 100)
      );
      const r = resistForCause(damageSource.cause, stats, hurtEntity);
      if (r > 0) {
        ev.damage *= 1 - r;
      }
    }
  });
} catch {
  /* API missing */
}

try {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const am = memory.get(ev.player.id);
    if (am && am.stamina <= 0.0001) {
      ev.cancel = true;
      return;
    }
    if (am) {
      am.miningTicks = 12;
    }
  });
} catch {
  /* API missing */
}

try {
  world.beforeEvents.itemUse.subscribe((ev) => {
    const am = memory.get(ev.source.id);
    if (am && am.stamina <= 0.0001) {
      ev.cancel = true;
    }
  });
} catch {
  /* API missing */
}

function asPlayer(entity) {
  if (!entity) {
    return undefined;
  }
  try {
    if (entity.typeId === "minecraft:player") {
      return entity;
    }
  } catch {
    /* ignore */
  }
  try {
    const id = entity.id;
    for (const p of world.getAllPlayers()) {
      if (p.id === id) {
        return p;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function playerFromHit(ev) {
  return (
    asPlayer(ev.damagingEntity) ||
    asPlayer(ev.player) ||
    asPlayer(ev.actor) ||
    asPlayer(ev.source)
  );
}

function spendMine(player, burst) {
  const m = mem(player);
  m.miningTicks = 12;
  const food = hungerFoodFraction(player);
  const stats = derivedStats(bonusesOf(player), food, num(player, DP.insomniaDays), m.stamina);
  m.stamina = clampStamina(player, stats, m.stamina - burst);
  setNum(player, DP.stamina, m.stamina);
}

try {
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = asPlayer(ev.damagingEntity);
    if (!player) {
      return;
    }
    const m = mem(player);
    const food = hungerFoodFraction(player);
    const stats = derivedStats(bonusesOf(player), food, num(player, DP.insomniaDays), m.stamina);
    m.stamina = clampStamina(player, stats, m.stamina - BURST.hitEntity);
  });
} catch {
  /* API missing */
}

try {
  world.afterEvents.entityHitBlock.subscribe((ev) => {
    const player = playerFromHit(ev);
    if (!player) {
      return;
    }
    spendMine(player, BURST.hitBlock);
  });
} catch {
  /* API missing */
}

try {
  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    spendMine(ev.player, BURST.breakBlock);
  });
} catch {
  /* API missing */
}

function spendBurst(player, burst) {
  const m = mem(player);
  const food = hungerFoodFraction(player);
  const stats = derivedStats(bonusesOf(player), food, num(player, DP.insomniaDays), m.stamina);
  m.stamina = clampStamina(player, stats, m.stamina - burst * stats.moveCostMult);
  setNum(player, DP.stamina, m.stamina);
}

try {
  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    if (isPlayable(ev.player)) {
      spendBurst(ev.player, BURST.placeBlock);
    }
  });
} catch {
  /* API missing */
}

function isToolWork(itemId, blockId) {
  if (itemId.endsWith("_hoe")) {
    return /grass_block|dirt|rooted_dirt/.test(blockId);
  }
  if (itemId.endsWith("_axe")) {
    return /_log|_wood|_stem|_hyphae|bamboo_block/.test(blockId) && !blockId.includes("stripped");
  }
  if (itemId.endsWith("_shovel")) {
    return /grass_block|dirt|podzol|mycelium/.test(blockId);
  }
  return false;
}

try {
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (ev.isFirstEvent === false) {
      return;
    }
    const itemId = ev.itemStack?.typeId ?? "";
    const blockId = ev.block?.typeId ?? "";
    if (!isToolWork(itemId, blockId)) {
      return;
    }
    const player = ev.player;
    const am = memory.get(player.id);
    if (am && am.stamina <= 0.0001) {
      ev.cancel = true;
      return;
    }
    system.run(() => {
      if (entityValid(player) && isPlayable(player)) {
        spendBurst(player, BURST.toolUse);
      }
    });
  });
} catch {
  /* API missing */
}

try {
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack?.typeId !== "minecraft:firework_rocket") {
      return;
    }
    const player = ev.source;
    if (!player.isGliding) {
      return;
    }
    const m = mem(player);
    const food = hungerFoodFraction(player);
    const stats = derivedStats(bonusesOf(player), food, num(player, DP.insomniaDays), m.stamina);
    m.stamina = clampStamina(player, stats, m.stamina - BURST.fireworkUse);
  });
} catch {
  /* API missing */
}

try {
  world.afterEvents.itemStartUse.subscribe((ev) => {
    const actor = ev.source ?? ev.player;
    const id = ev.itemStack?.typeId ?? "";
    if (actor && (id.includes("bow") || id.includes("crossbow") || id.includes("trident"))) {
      mem(actor).drawing = true;
    }
  });
} catch {
  /* API missing */
}

try {
  world.afterEvents.itemStopUse.subscribe((ev) => {
    const actor = ev.source ?? ev.player;
    if (actor) {
      mem(actor).drawing = false;
    }
  });
} catch {
  /* API missing */
}

try {
  world.afterEvents.entityDie.subscribe((ev) => {
    const killer = ev.damageSource?.damagingEntity;
    if (!killer || killer.typeId !== "minecraft:player") {
      return;
    }
    let typeId = "";
    try {
      typeId = ev.deadEntity?.typeId ?? "";
    } catch {
      return;
    }
    const add = dangerKillAmount(typeId);
    if (add <= 0) {
      return;
    }
    const m = mem(killer);
    m.danger = clampDanger(m.danger + add);
    setNum(killer, DP.danger, m.danger);
  });
} catch {
  /* API missing */
}

attachCommands({ mem, num, setNum });
