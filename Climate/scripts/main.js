import { system, world, GameMode } from "@minecraft/server";
import { TICK_INTERVAL, DP } from "./config.js";
import { num, setNum, tickClimate } from "./climate.js";
import {
  applyTimeWarp,
  seasonState,
  SEASON_LABEL,
  tryAutumnLeaves,
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

let warpOwner = null;

system.runInterval(() => {
  let time = 0;
  try {
    time = world.getTimeOfDay();
  } catch {
    time = 0;
  }

  const season = seasonState();
  const players = world.getAllPlayers();

  // One time-warp per tick (host/first overworld player)
  if (players.length) {
    const warpPlayer =
      players.find((p) => p.dimension.id === "minecraft:overworld") || players[0];
    if (warpPlayer && (!warpOwner || warpOwner === warpPlayer.id)) {
      warpOwner = warpPlayer.id;
      time = applyTimeWarp(time, season.name);
    }
  }

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
      tryWinterSnow(player, season.name);
      tryAutumnLeaves(player, season.name);
    } catch (e) {
      console.warn("[Kindling Climate]", e);
    }
  }
}, TICK_INTERVAL);

world.afterEvents.worldLoad.subscribe(() => {
  console.warn("[Kindling Climate] seasons cycle loaded");
  warpOwner = null;
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
    const insomnia = num(p, DP.insomniaDays, 0);
    p.sendMessage(
      `§6Climate §eheat §f${num(p, DP.heat).toFixed(0)}  §ecold §f${num(p, DP.cold).toFixed(0)}`
    );
    p.sendMessage(
      `${SEASON_LABEL[season.name] || season.name} §7day §f${season.dayInSeason}§7/§f${season.daysPerSeason}  §einsomnia §f${insomnia}`
    );
  });
});
