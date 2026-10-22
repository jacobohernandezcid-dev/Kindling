import * as mc from "@minecraft/server";
import { DP, RESIST_CAP } from "./config.js";
import { clampDanger, DANGER_MAX } from "./danger.js";

const world = mc.world;
const system = mc.system;

const HELP = [
  "§e/kl:get§7 or §e.k get§7 — show hidden stats",
  "§e/kl:set <stat> <n>§7 or §e.k set <stat> <n>",
  "§e/kl:add <stat> <n>§7 or §e.k add <stat> <n>",
  "§e/kl:reset§7 — hidden bonuses 0, stamina full, danger 0",
  "§7stats: strength agility regen vitality fire heat cold poison danger stamina insomnia",
];

const ALIAS = {
  str: "strength",
  strength: "strength",
  agi: "agility",
  agility: "agility",
  regen: "regen",
  vit: "vitality",
  vitality: "vitality",
  hp: "vitality",
  fire: "fire",
  fireres: "fire",
  heat: "heat",
  heatres: "heat",
  cold: "cold",
  coldres: "cold",
  poison: "poison",
  poisonres: "poison",
  danger: "danger",
  stam: "stamina",
  stamina: "stamina",
  insomnia: "insomnia",
  sleep: "insomnia",
};

function spec(name) {
  switch (name) {
    case "strength":
      return { dp: DP.strength, min: 0, max: 999 };
    case "agility":
      return { dp: DP.agility, min: 0, max: 999 };
    case "regen":
      return { dp: DP.regenBonus, min: 0, max: 999 };
    case "vitality":
      return { dp: DP.vitality, min: 0, max: 999 };
    case "fire":
      return { dp: DP.fireRes, min: 0, max: RESIST_CAP };
    case "heat":
      return { dp: DP.heatRes, min: 0, max: RESIST_CAP };
    case "cold":
      return { dp: DP.coldRes, min: 0, max: RESIST_CAP };
    case "poison":
      return { dp: DP.poisonRes, min: 0, max: RESIST_CAP };
    case "danger":
      return { dp: DP.danger, min: 0, max: DANGER_MAX, mem: "danger", clamp: clampDanger };
    case "stamina":
      return { dp: DP.stamina, min: 0, max: 999, mem: "stamina" };
    case "insomnia":
      return { dp: DP.insomniaDays, min: 0, max: 365 };
    default:
      return undefined;
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatDump(ctx, player) {
  const m = ctx.mem(player);
  const lines = [
    `§6Kindling Body stats`,
    `§estamina §f${m.stamina.toFixed(1)}  §edanger §f${m.danger.toFixed(1)}  §einsomnia §f${ctx.num(player, DP.insomniaDays)}`,
    `§estrength §f${ctx.num(player, DP.strength)}  §eagility §f${ctx.num(player, DP.agility)}  §eregen §f${ctx.num(player, DP.regenBonus)}  §evitality §f${ctx.num(player, DP.vitality)}`,
    `§efire §f${ctx.num(player, DP.fireRes)}  §eheat §f${ctx.num(player, DP.heatRes)}  §ecold §f${ctx.num(player, DP.coldRes)}  §epoison §f${ctx.num(player, DP.poisonRes)}`,
  ];
  return lines;
}

function writeStat(ctx, player, name, value) {
  const s = spec(name);
  if (!s) {
    return `§cUnknown stat §f${name}`;
  }
  let next = clamp(value, s.min, s.max);
  if (s.clamp) {
    next = s.clamp(next);
  }
  ctx.setNum(player, s.dp, next);
  if (s.mem) {
    ctx.mem(player)[s.mem] = next;
  }
  return `§a${name} §f= ${next}`;
}

function run(ctx, player, args) {
  const cmd = (args[0] || "help").toLowerCase();
  if (cmd === "help" || cmd === "?") {
    for (const line of HELP) {
      player.sendMessage(line);
    }
    return;
  }
  if (cmd === "get" || cmd === "list" || cmd === "stats") {
    for (const line of formatDump(ctx, player)) {
      player.sendMessage(line);
    }
    return;
  }
  if (cmd === "reset") {
    writeStat(ctx, player, "strength", 0);
    writeStat(ctx, player, "agility", 0);
    writeStat(ctx, player, "regen", 0);
    writeStat(ctx, player, "vitality", 0);
    writeStat(ctx, player, "fire", 0);
    writeStat(ctx, player, "heat", 0);
    writeStat(ctx, player, "cold", 0);
    writeStat(ctx, player, "poison", 0);
    writeStat(ctx, player, "danger", 0);
    writeStat(ctx, player, "insomnia", 0);
    writeStat(ctx, player, "stamina", 100);
    player.sendMessage("§aHidden stats reset. Danger 0, stamina full.");
    return;
  }
  if (cmd === "set" || cmd === "add") {
    const alias = (args[1] || "").toLowerCase();
    const name = ALIAS[alias];
    const amount = Number(args[2]);
    if (!name || !Number.isFinite(amount)) {
      player.sendMessage("§cUsage: .k set <stat> <number>");
      return;
    }
    const s = spec(name);
    const current = s.mem ? ctx.mem(player)[s.mem] : ctx.num(player, s.dp);
    const next = cmd === "add" ? current + amount : amount;
    player.sendMessage(writeStat(ctx, player, name, next));
    return;
  }
  player.sendMessage("§cUnknown. §e.k help §7or §e/kl:help");
}

function stripChatPrefix(text) {
  const lower = text.toLowerCase();
  const prefixes = [".kindling", ".kl", ".k", "kindling", "kl"];
  for (const p of prefixes) {
    if (lower === p || lower.startsWith(`${p} `)) {
      return text.slice(p.length).trim();
    }
  }
  return null;
}

function scriptAction(id) {
  const lower = id.toLowerCase();
  if (lower.startsWith("kindling:")) {
    return id.slice("kindling:".length);
  }
  if (lower.startsWith("kl:")) {
    return id.slice(3);
  }
  if (lower.startsWith("np:")) {
    return id.slice(3);
  }
  return null;
}

const recentChat = new Map();

function handleChat(ctx, ev, cancel) {
  const text = (ev.message || "").trim();
  const rest = stripChatPrefix(text);
  if (rest === null) {
    return;
  }
  const sender = ev.sender;
  const key = `${sender?.id || "?"}:${text}`;
  const now = Date.now();
  if (recentChat.has(key) && now - recentChat.get(key) < 400) {
    if (cancel) {
      try {
        ev.cancel = true;
      } catch {
        /* ignore */
      }
    }
    return;
  }
  recentChat.set(key, now);
  if (cancel) {
    try {
      ev.cancel = true;
    } catch {
      /* cannot cancel */
    }
  }
  const args = rest.split(/\s+/).filter(Boolean);
  system.run(() => {
    try {
      run(ctx, sender, args);
    } catch (e) {
      try {
        sender.sendMessage(`§c${e}`);
      } catch {
        /* ignore */
      }
    }
  });
}

function commandPlayer(origin) {
  return asCommandPlayer(origin?.sourceEntity) || asCommandPlayer(origin?.initiator);
}

function asCommandPlayer(entity) {
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
  return undefined;
}

function registerCustomCommands(ctx, registry) {
  const StatusSuccess = mc.CustomCommandStatus?.Success ?? 0;
  const Param = mc.CustomCommandParamType ?? {};
  const perm = mc.CommandPermissionLevel?.Any ?? 0;

  const wrap = (buildArgs) => (origin, ...rest) => {
    const player = commandPlayer(origin);
    if (!player) {
      return { status: mc.CustomCommandStatus?.Failure ?? 1, message: "Kindling commands are for players." };
    }
    const args = buildArgs(rest);
    system.run(() => {
      try {
        run(ctx, player, args);
      } catch (e) {
        try {
          player.sendMessage(`§c${e}`);
        } catch {
          /* ignore */
        }
      }
    });
    return { status: StatusSuccess };
  };

  const cmds = [
    {
      spec: {
        name: "kl:get",
        description: "Kindling Body: show hidden stats",
        permissionLevel: perm,
        cheatsRequired: false,
      },
      args: () => ["get"],
    },
    {
      spec: {
        name: "kl:help",
        description: "Kindling Body: command help",
        permissionLevel: perm,
        cheatsRequired: false,
      },
      args: () => ["help"],
    },
    {
      spec: {
        name: "kl:reset",
        description: "Kindling Body: reset hidden stats",
        permissionLevel: perm,
        cheatsRequired: false,
      },
      args: () => ["reset"],
    },
    {
      spec: {
        name: "kl:set",
        description: "Kindling Body: set a hidden stat",
        permissionLevel: perm,
        cheatsRequired: false,
        mandatoryParameters: [
          { type: Param.String ?? 1, name: "stat" },
          { type: Param.Float ?? 2, name: "value" },
        ],
      },
      args: (rest) => ["set", ...flattenArgs(rest)],
    },
    {
      spec: {
        name: "kl:add",
        description: "Kindling Body: add to a hidden stat",
        permissionLevel: perm,
        cheatsRequired: false,
        mandatoryParameters: [
          { type: Param.String ?? 1, name: "stat" },
          { type: Param.Float ?? 2, name: "value" },
        ],
      },
      args: (rest) => ["add", ...flattenArgs(rest)],
    },
  ];

  for (const cmd of cmds) {
    try {
      registry.registerCommand(cmd.spec, wrap(cmd.args));
    } catch {
      /* command register failed */
    }
  }
}

function flattenArgs(rest) {
  if (rest.length === 1 && Array.isArray(rest[0])) {
    return rest[0].filter((v) => v !== undefined && v !== null).map(String);
  }
  return rest.filter((v) => v !== undefined && v !== null).map(String);
}

export function attachCommands(ctx) {
  try {
    world.beforeEvents.chatSend.subscribe((ev) => handleChat(ctx, ev, true));
  } catch {
    /* beforeEvents chat API missing */
  }

  try {
    world.afterEvents.chatSend.subscribe((ev) => handleChat(ctx, ev, false));
  } catch {
    /* afterEvents chat API missing */
  }

  try {
    system.afterEvents.scriptEventReceive.subscribe((ev) => {
      const id = ev.id || "";
      const action = scriptAction(id);
      if (action === null) {
        return;
      }
      const player = ev.sourceEntity;
      if (!player || player.typeId !== "minecraft:player") {
        return;
      }
      const rest = (ev.message || "").trim().split(/\s+/).filter(Boolean);
      const args = action === "stat" || action === "np" || action === "k" ? rest : [action, ...rest];
      run(ctx, player, args);
    });
  } catch {
    /* scriptevent API missing */
  }

  try {
    system.beforeEvents.startup.subscribe((ev) => {
      try {
        registerCustomCommands(ctx, ev.customCommandRegistry);
      } catch {
        /* register failed */
      }
    });
  } catch {
    /* startup / custom commands missing */
  }
}
