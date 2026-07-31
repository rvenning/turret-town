// Turret Town — the monster registry.
//
// Speed is in GRID CELLS PER SECOND, so a 2.0 monster crosses a ten-wide map in
// five seconds. `armour` is flat damage subtracted from every hit, which is what
// makes a wall of cheap Archer Posts stop working around wave six — a Watchtower
// pierces it, a Bomb Lobber out-muscles it, and twelve arrows a second do not.
//
// `leak` is how many town lives it costs if it walks out the far side. Bosses
// cost five, so a boss getting through is the end of the level rather than a
// shrug.

const ENEMIES = [
  {
    id: "slug", name: "Slug", icon: "🐌",
    hp: 26, speed: 0.85, gold: 4,
    body: "#8bc24a", shell: "#6b8f36",
  },
  {
    id: "scurrier", name: "Scurrier", icon: "🐜",
    hp: 15, speed: 2.1, gold: 3,
    body: "#c9563f", shell: "#8f3626",
  },
  {
    id: "brute", name: "Brute", icon: "🐗", armour: 5,
    hp: 95, speed: 0.72, gold: 11,
    body: "#7a6a58", shell: "#4e4238",
  },
  {
    id: "flitter", name: "Flitter", icon: "🦇", flying: true,
    hp: 32, speed: 1.6, gold: 6,
    body: "#6f5aa8", shell: "#3e3168",
  },
  {
    id: "wisp", name: "Wisp", icon: "👻", chill: false,
    hp: 44, speed: 1.25, gold: 7,
    body: "#d9e6ff", shell: "#8fa6d8",
  },
  {
    // Dies into two Sluglings, so killing it late in the path just moves the
    // problem closer to town.
    id: "splitter", name: "Splitter", icon: "🥚",
    hp: 60, speed: 1.0, gold: 8, splits: ["slugling", "slugling"],
    body: "#e8c46a", shell: "#b08b2e",
  },
  {
    id: "slugling", name: "Slugling", icon: "🐛",
    hp: 18, speed: 1.5, gold: 2,
    body: "#a8d86a", shell: "#7ba53f",
  },
  {
    id: "hornet", name: "Hornet", icon: "🐝", flying: true, armour: 3,
    hp: 70, speed: 2.0, gold: 9,
    body: "#ffd63d", shell: "#8a6a00",
  },

  /* ---------- bosses (leak = 5 lives) ---------- */
  {
    id: "dragon", name: "Cinder Dragon", icon: "🐲", boss: true, flying: true,
    hp: 950, speed: 0.72, armour: 6, gold: 90, leak: 5,
    body: "#e0563f", shell: "#8d2a1c",
  },
  {
    id: "titan", name: "Stone Titan", icon: "🗿", boss: true,
    hp: 1900, speed: 0.6, armour: 12, gold: 130, leak: 5,
    body: "#9aa0a8", shell: "#5a6068",
    // Shrugs off chills — a frost wall alone will not hold it.
    chill: false,
  },
  {
    id: "warlord", name: "Goblin Warlord", icon: "👹", boss: true,
    hp: 3400, speed: 0.68, armour: 14, gold: 200, leak: 5,
    body: "#c2453f", shell: "#6d1f1c",
    // Every 6 seconds it drops two Scurriers behind it.
    spawns: { id: "scurrier", every: 6, n: 2 },
  },
];

const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

// Damage after armour. A hit never does less than 1, so an armoured monster is
// a bad target rather than an invincible one — you can always chip it down while
// you save for a Watchtower.
function damageAfterArmour(raw, def, pierce) {
  if (pierce) return raw;
  return Math.max(1, raw - (def.armour || 0));
}

if (typeof module !== "undefined") {
  module.exports = { ENEMIES, ENEMY_BY_ID, damageAfterArmour };
}
