import { system, world, GameMode } from "@minecraft/server";
import {
  COLD_DAMAGE_AT,
  COLD_SLOW_AT,
  DP,
  HEAT_HUNGER_AT,
  HEAT_SLOW_AT,
  TICK_INTERVAL,
} from "./config.js";
import { insomniaDays, num, setNum, tickClimate } from "./climate.js";
import { sharedExists, SHARED } from "./shared.js";
import {
  seasonState,
  SEASON_LABEL,
  tryAutumnLeaves,
  trySpringMelt,
  tryWinterSnow,
} from "./seasons.js";

function isCreativeOrSpectator(player) {
  try {
    const mode = player.getGameMode?.() ?? player.gameMode;
    if (mode === GameMode.creative || mode === GameMode.spectator) {
      return true;
    }
    if (mode === "Creative" || mode === "Spectator") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function greet(player, season) {
  if (player.__klClimateGreet) {
    return;
  }
  player.__klClimateGreet = true;
  try {
    player.sendMessage(
      `§6Kindling Climate §eloaded. §7${SEASON_LABEL[season.name] || season.name} §7(day ${season.dayInSeason}/${season.daysPerSeason}). Heat, cold, seasons. §e.kl climate`
    );
  } catch {
    /* ignore */
  }
}

function maybeAnnounceSeason(player, season) {
  const prev = num(player, DP.lastSeason, -1);
  if (prev === season.index) {
    return;
  }
  setNum(player, DP.lastSeason, season.index);
  if (prev < 0) {
    return;
  }
  try {
    player.sendMessage(
      `§6Season §f→ ${SEASON_LABEL[season.name] || season.name}`
    );
  } catch {
    /* ignore */
  }
}

/**
 * Kindling Body draws heat / cold next to its stamina bar. Without Body,
 * show a plain action-bar warning instead.
 */
function showFallbackHud(player) {
  if (sharedExists(SHARED.insomnia)) {
    return;
  }
  const cold = num(player, DP.cold);
  const heat = num(player, DP.heat);
  let text = "";
  if (cold >= COLD_DAMAGE_AT) {
    text = "§bFreezing";
  } else if (cold >= COLD_SLOW_AT) {
    text = "§3Cold";
  } else if (heat >= HEAT_SLOW_AT) {
    text = "§cOverheating";
  } else if (heat >= HEAT_HUNGER_AT) {
    text = "§6Hot";
  }
  if (text) {
    try {
      player.onScreenDisplay.setActionBar(text);
    } catch {
      /* ignore */
    }
  }
}

system.runInterval(() => {
  let time = 0;
  try {
    time = world.getTimeOfDay();
  } catch {
    time = 0;
  }

  const season = seasonState();
  const players = world.getAllPlayers();

  for (const player of players) {
    greet(player, season);
    maybeAnnounceSeason(player, season);
    if (isCreativeOrSpectator(player)) {
      setNum(player, DP.heat, 0);
      setNum(player, DP.cold, 0);
      continue;
    }
    try {
      tickClimate(player, time, season.name);
      showFallbackHud(player);
      tryWinterSnow(player, season.name);
      trySpringMelt(player, season.name);
      tryAutumnLeaves(player, season.name);
    } catch (e) {
      console.warn("[Kindling Climate]", e);
    }
  }
}, TICK_INTERVAL);

world.afterEvents.worldLoad.subscribe(() => {
  console.warn("[Kindling Climate] seasons cycle loaded");
});

world.beforeEvents.chatSend.subscribe((event) => {
  const text = (event.message || "").trim().toLowerCase();
  if (
    text !== ".kl climate" &&
    text !== ".k climate" &&
    text !== ".kl season" &&
    text !== ".k season"
  ) {
    return;
  }
  event.cancel = true;
  const p = event.sender;
  system.run(() => {
    const season = seasonState();
    const insomnia = insomniaDays(p);
    p.sendMessage(
      `§6Climate §eheat §f${num(p, DP.heat).toFixed(0)}  §ecold §f${num(p, DP.cold).toFixed(0)}`
    );
    p.sendMessage(
      `${SEASON_LABEL[season.name] || season.name} §7day §f${season.dayInSeason}§7/§f${season.daysPerSeason}  §einsomnia §f${insomnia}`
    );
  });
});
