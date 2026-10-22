#!/usr/bin/env node
/**
 * Packs the Kindling addons into dist/Kindling.mcaddon (a zip with one
 * folder per pack). Double-clicking the file imports every pack into
 * Minecraft.
 *
 * Usage: node tools/build-mcaddon.mjs
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = ["Body", "BodyRP", "Climate", "ClimateRP", "Ores", "OresRP"];
const SKIP = [/\.py$/i, /^\./];
const OUT = join(ROOT, "dist", "Kindling.mcaddon");

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.some((re) => re.test(name))) {
      continue;
    }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, day } = dosTime(new Date());

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + packed.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const entries = [];
for (const pack of PACKS) {
  const dir = join(ROOT, pack);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  console.log(`${pack.padEnd(10)} v${manifest.header.version.join(".")}`);
  for (const file of listFiles(dir)) {
    entries.push({
      name: relative(ROOT, file).split(sep).join("/"),
      data: readFileSync(file),
    });
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buildZip(entries));
console.log(`wrote ${relative(ROOT, OUT)} (${entries.length} files, ${(statSync(OUT).size / 1024).toFixed(0)} KB)`);
