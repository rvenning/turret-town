// Turret Town — the Armoury: permanent upgrades bought with coins between maps.
//
// Coins are a separate currency from the gold you spend inside a level, so a
// good run never inflates the in-level economy that the balance bots measure.
//
// One of these is a RESCUE, and rescues have a rule: they must FORGIVE, not
// skip. Sandbags refund a life for a monster that ALREADY got through — the
// only moment anyone knows they needed it. An item that only helps if you buy it
// before you're in trouble is inert, however good the number on it looks.

const UPGRADES = [
  {
    id: "chest", name: "War Chest", icon: "💰",
    desc: "Start every map with more gold.",
    costs: [60, 140, 280], gold: [40, 85, 140],
  },
  {
    id: "walls", name: "Town Walls", icon: "🧱",
    desc: "More lives before the town falls.",
    costs: [90, 220], lives: [3, 6],
  },
  {
    id: "aim", name: "Sharpened Aim", icon: "🎯",
    desc: "Every turret hits harder.",
    costs: [120, 260, 500], power: [0.08, 0.16, 0.26],
  },
  {
    id: "bulk", name: "Bulk Order", icon: "🛠️",
    desc: "Turrets cost less to build and upgrade.",
    costs: [140, 320], discount: [0.08, 0.15],
  },
  {
    id: "sand", name: "Sandbags", icon: "🛡️",
    desc: "The first monsters through each map cost you no lives at all.",
    costs: [100, 240], sandbags: [1, 2],
  },
];

const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

function upgradeLevel(prog, id) {
  return ((prog && prog.upgrades) || {})[id] || 0;
}

// Flatten everything bought into the single object the engine reads. The engine
// never looks up an upgrade by name, so adding one here can't reach into game.js.
function upgradeLoadout(prog) {
  const out = { gold: 0, lives: 0, power: 0, discount: 0, sandbags: 0 };
  for (const u of UPGRADES) {
    const lvl = upgradeLevel(prog, u.id);
    if (!lvl) continue;
    for (const key of ["gold", "lives", "power", "discount", "sandbags"]) {
      if (u[key]) out[key] += u[key][lvl - 1];
    }
  }
  return out;
}

// Coins earned for a finished map. The first clear pays a bonus, so working
// through the campaign is worth more than farming map one forever.
const COIN_REWARD = { 0: 0, 1: 14, 2: 24, 3: 40 };
const FIRST_CLEAR_BONUS = 30;

function coinsFor(result, alreadyBeaten) {
  if (result.mode === "siege") return Math.floor((result.score || 0) / 45);
  if (!result.win) return 0;
  return COIN_REWARD[result.stars] + (alreadyBeaten ? 0 : FIRST_CLEAR_BONUS);
}

if (typeof module !== "undefined") {
  module.exports = {
    UPGRADES, UPGRADE_BY_ID, upgradeLevel, upgradeLoadout,
    COIN_REWARD, FIRST_CLEAR_BONUS, coinsFor,
  };
}
