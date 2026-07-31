// Turret Town — the tower registry.
//
// A new turret is ONE entry here plus a draw function in render.js. Everything
// else (build bar, upgrade panel, costs, targeting) reads these tables.
//
// Stats are per level, so `dmg[0]` is the freshly built turret and `dmg[2]` is
// fully upgraded. `costs` is the same length as the stat arrays: costs[0] builds
// it, costs[1] buys level 2, costs[2] buys level 3.
//
// Units are GRID CELLS and SECONDS throughout — range 3 means three cells, rate
// 1.2 means 1.2 shots per second. Nothing in here is in pixels, so the map can
// be drawn at any scale without touching the balance.

const TOWERS = [
  {
    id: "bow",
    name: "Archer Post",
    icon: "🏹",
    blurb: "Cheap, quick, hits anything. Your bread and butter.",
    body: "#7a5b3a", trim: "#c9e26b",
    kind: "bolt",              // a homing arrow with travel time
    air: true,
    costs: [20, 25, 45],
    dmg: [6, 10, 16],
    range: [2.4, 2.7, 3.0],
    rate: [1.2, 1.4, 1.7],
    shotSpeed: 11,
  },
  {
    id: "bomb",
    name: "Bomb Lobber",
    icon: "💣",
    blurb: "Slow lob, big splash. Wrecks crowds — but can't reach the sky.",
    body: "#5c5148", trim: "#ff8a3d",
    kind: "bomb",
    air: false,
    costs: [45, 55, 90],
    dmg: [15, 24, 38],
    splash: [0.95, 1.1, 1.3],
    range: [2.6, 2.9, 3.2],
    rate: [0.55, 0.62, 0.72],
    shotSpeed: 6.5,
  },
  {
    id: "frost",
    name: "Frost Fan",
    icon: "❄️",
    blurb: "Chills EVERY monster in range at once. Barely hurts — that's not the point.",
    body: "#5a7f9c", trim: "#d6f2ff",
    kind: "pulse",             // instant, hits everything in range
    air: true,
    costs: [35, 40, 70],
    dmg: [2, 3, 5],
    range: [2.0, 2.3, 2.6],
    rate: [0.9, 1.0, 1.1],
    slow: [0.42, 0.52, 0.62],  // fraction of speed removed
    slowFor: [1.3, 1.5, 1.8],  // seconds
  },
  {
    id: "tesla",
    name: "Tesla Coil",
    icon: "⚡",
    blurb: "A bolt that jumps between monsters. Loves a tight corner.",
    body: "#463a6b", trim: "#ffe14d",
    kind: "chain",
    air: true,
    costs: [70, 80, 130],
    dmg: [13, 19, 28],
    chain: [2, 3, 4],          // total targets hit
    chainFall: 0.7,            // each jump does 70% of the last
    chainHop: 1.8,             // cells a bolt can jump
    range: [2.2, 2.4, 2.7],
    rate: [0.8, 0.9, 1.0],
  },
  {
    id: "watch",
    name: "Watchtower",
    icon: "🎯",
    blurb: "Sees half the map and punches straight through armour. Very slow.",
    body: "#6d4b6b", trim: "#ffd63d",
    kind: "beam",              // instant hitscan, single target
    air: true,
    pierce: true,              // ignores armour entirely
    costs: [60, 70, 120],
    dmg: [32, 52, 80],
    range: [5.0, 5.6, 6.4],
    rate: [0.36, 0.42, 0.48],
  },
];

const TOWER_BY_ID = Object.fromEntries(TOWERS.map((t) => [t.id, t]));

// Selling never returns full price — otherwise a turret is a free undo and
// placement stops being a decision.
const SELL_RATIO = 0.6;

// What a turret costs to build or upgrade, after the armoury discount.
// `loadout.discount` is a fraction (0.1 = 10% off). Always at least 1 gold.
function towerCost(def, level, loadout) {
  if (level >= def.costs.length) return null;      // fully upgraded
  const raw = def.costs[level];
  const off = (loadout && loadout.discount) || 0;
  return Math.max(1, Math.round(raw * (1 - off)));
}

// What you get back for selling: everything spent on it, at SELL_RATIO.
function towerRefund(def, level, loadout) {
  let spent = 0;
  for (let i = 0; i < level; i++) spent += towerCost(def, i, loadout);
  return Math.floor(spent * SELL_RATIO);
}

// Stat lookup with the armoury damage bonus folded in, so nothing downstream
// has to remember to apply it.
function towerStat(def, level, key, loadout) {
  const arr = def[key];
  if (!Array.isArray(arr)) return arr;
  const v = arr[Math.min(level, arr.length - 1)];
  if (key === "dmg" && loadout && loadout.power) return v * (1 + loadout.power);
  return v;
}

if (typeof module !== "undefined") {
  module.exports = { TOWERS, TOWER_BY_ID, SELL_RATIO, towerCost, towerRefund, towerStat };
}
