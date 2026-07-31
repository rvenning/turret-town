// Turret Town — the campaign: three regions of five maps.
//
// A map is a WAYPOINT LIST, not an ASCII picture. Every leg is axis-aligned and
// the engine walks between the corners to build the real cell path, which means
// a map can't be one character wide in the wrong place — the only mistakes
// available are "not axis-aligned" and "off the board", and tests/levels.test.js
// fails on both. (Deep Jungle hand-counted ASCII rows and roughly one row in
// fifty was wrong.)
//
// The first and last waypoints sit OFF the board (row -1, or row `rows`), so
// monsters walk in from the top edge and out of the bottom rather than popping
// into existence on a cell you might have built on.
//
// A wave is a list of groups: [enemyId, count, gapSeconds, startAtSeconds].
// Groups overlap freely, so "twelve slugs, and four scurriers barging past them
// five seconds in" is one line.
//
// `hpMul` scales every monster on the map. It is the tuning dial: change one
// number and re-run tests/bot.test.js rather than rewriting thirty waves.

const REGIONS = [
  { name: "Green Meadows", icon: "🌿", hue: "#8bc24a" },
  { name: "Ashfall Ridge", icon: "🌋", hue: "#e0784a" },
  { name: "Frostfell", icon: "🏔️", hue: "#7cc4e8" },
];

const COLS = 10, ROWS = 14;

const LEVELS = [
  /* ---------------- Region 1 — Green Meadows ---------------- */
  {
    name: "Meadow Gate", region: 0, gold: 130, lives: 20, hpMul: 1,
    path: [[4, -1], [4, 3], [8, 3], [8, 8], [2, 8], [2, 12], [7, 12], [7, 14]],
    rocks: [[6, 5], [7, 5]],
    hint: "Tap a grassy square to build. Monsters follow the road — cover the corners.",
    waves: [
      [["slug", 5, 1.0]],
      [["slug", 7, 0.85]],
      [["scurrier", 6, 0.7]],
      [["slug", 8, 0.8], ["scurrier", 4, 0.6, 6]],
      [["scurrier", 10, 0.5]],
      [["slug", 10, 0.7], ["scurrier", 6, 0.5, 5]],
      [["slug", 12, 0.6], ["scurrier", 8, 0.45, 4]],
      [["slug", 14, 0.55], ["scurrier", 12, 0.4, 5]],
    ],
  },
  {
    name: "Old Mill Lane", region: 0, gold: 140, lives: 20, hpMul: 1.05,
    path: [[1, -1], [1, 2], [8, 2], [8, 6], [1, 6], [1, 10], [8, 10], [8, 14]],
    rocks: [[4, 4], [5, 4], [4, 8], [5, 8]],
    hint: "Brutes wear armour — small arrows barely scratch them.",
    waves: [
      [["slug", 8, 0.8]],
      [["scurrier", 10, 0.5]],
      [["slug", 10, 0.7], ["scurrier", 6, 0.5, 4]],
      [["brute", 2, 2.5]],
      [["scurrier", 14, 0.4]],
      [["brute", 3, 2.2], ["slug", 8, 0.7, 3]],
      [["slug", 14, 0.55], ["scurrier", 10, 0.4, 4]],
      [["brute", 4, 2.0], ["scurrier", 12, 0.4, 4]],
      [["brute", 6, 1.8], ["slug", 12, 0.5, 2], ["scurrier", 10, 0.35, 8]],
    ],
  },
  {
    name: "Bramble Bend", region: 0, gold: 150, lives: 20, hpMul: 1.1,
    path: [[8, -1], [8, 3], [2, 3], [2, 7], [7, 7], [7, 11], [1, 11], [1, 14]],
    rocks: [[0, 5], [0, 6], [9, 9], [9, 10], [5, 0]],
    hint: "Flitters FLY — they cut straight across. Bomb Lobbers can't touch them.",
    waves: [
      [["slug", 10, 0.7]],
      [["scurrier", 12, 0.45]],
      [["flitter", 4, 1.4]],
      [["brute", 3, 2.2], ["slug", 8, 0.7, 3]],
      [["flitter", 7, 1.0]],
      [["scurrier", 16, 0.35], ["flitter", 4, 1.4, 5]],
      [["brute", 5, 1.8], ["slug", 10, 0.6, 3]],
      [["flitter", 9, 0.8], ["scurrier", 10, 0.4, 4]],
      [["brute", 6, 1.6], ["flitter", 6, 1.0, 5]],
      [["slug", 16, 0.5], ["scurrier", 14, 0.35, 4], ["flitter", 6, 1.0, 8]],
    ],
  },
  {
    name: "Stonebrook", region: 0, gold: 160, lives: 20, hpMul: 1.2,
    path: [[2, -1], [2, 2], [7, 2], [7, 5], [1, 5], [1, 9], [8, 9], [8, 12], [3, 12], [3, 14]],
    rocks: [[4, 7], [5, 7], [0, 12], [9, 0], [9, 1]],
    hint: "Splitters burst into two when they die. Kill them EARLY on the road.",
    waves: [
      [["slug", 12, 0.6]],
      [["scurrier", 14, 0.4]],
      [["splitter", 3, 2.0]],
      [["flitter", 7, 1.0]],
      [["splitter", 5, 1.6], ["scurrier", 10, 0.4, 4]],
      [["brute", 5, 1.8], ["slug", 12, 0.55, 3]],
      [["splitter", 6, 1.4], ["flitter", 6, 1.1, 5]],
      [["scurrier", 20, 0.3], ["brute", 4, 2.0, 5]],
      [["splitter", 8, 1.2], ["brute", 5, 1.8, 4]],
      [["flitter", 10, 0.8], ["splitter", 6, 1.4, 4], ["scurrier", 14, 0.35, 8]],
    ],
  },
  {
    name: "Meadow Keep", region: 0, gold: 190, lives: 20, hpMul: 1.25, boss: "dragon",
    path: [[5, -1], [5, 2], [1, 2], [1, 5], [8, 5], [8, 8], [2, 8], [2, 11], [7, 11], [7, 14]],
    rocks: [[0, 0], [9, 2], [9, 3], [4, 6], [5, 6], [0, 10]],
    hint: "The Cinder Dragon flies and wears armour. A Watchtower punches straight through it.",
    waves: [
      [["slug", 12, 0.6], ["scurrier", 8, 0.5, 4]],
      [["brute", 4, 2.0]],
      [["flitter", 8, 0.9]],
      [["splitter", 6, 1.4], ["scurrier", 12, 0.4, 4]],
      [["brute", 6, 1.7], ["slug", 12, 0.55, 3]],
      [["flitter", 10, 0.8], ["splitter", 5, 1.5, 5]],
      [["scurrier", 22, 0.3], ["brute", 5, 1.9, 5]],
      [["splitter", 8, 1.2], ["flitter", 8, 0.9, 4]],
      [["brute", 8, 1.5], ["scurrier", 16, 0.35, 4]],
      [["dragon", 1, 1]],
    ],
  },

  /* ---------------- Region 2 — Ashfall Ridge ---------------- */
  {
    name: "Cinder Path", region: 1, gold: 170, lives: 20, hpMul: 1.35,
    path: [[1, -1], [1, 3], [5, 3], [5, 1], [9, 1], [9, 6], [3, 6], [3, 9], [8, 9], [8, 12], [1, 12], [1, 14]],
    rocks: [[7, 3], [7, 4], [0, 7], [0, 8], [6, 11]],
    hint: "A long road buys you time. Wisps ignore the cold — chilling them does nothing.",
    waves: [
      [["slug", 14, 0.55], ["scurrier", 10, 0.4, 4]],
      [["brute", 5, 1.8]],
      [["wisp", 6, 1.2]],
      [["flitter", 10, 0.8]],
      [["wisp", 8, 1.0], ["scurrier", 14, 0.35, 4]],
      [["splitter", 8, 1.2], ["brute", 4, 2.0, 4]],
      [["wisp", 10, 0.9], ["flitter", 8, 0.9, 5]],
      [["brute", 8, 1.5], ["splitter", 6, 1.4, 4]],
      [["scurrier", 26, 0.26], ["wisp", 8, 1.0, 6]],
      [["brute", 8, 1.5], ["flitter", 10, 0.8, 3], ["wisp", 8, 1.0, 7]],
    ],
  },
  {
    name: "Ember Gorge", region: 1, gold: 175, lives: 18, hpMul: 1.5,
    path: [[8, -1], [8, 2], [2, 2], [2, 5], [7, 5], [7, 8], [1, 8], [1, 11], [6, 11], [6, 14]],
    rocks: [[4, 3], [5, 3], [4, 4], [9, 6], [9, 7], [0, 13]],
    hint: "Hornets are armoured AND airborne. Arrows alone will not stop them.",
    waves: [
      [["scurrier", 18, 0.35], ["slug", 10, 0.6, 4]],
      [["brute", 6, 1.7]],
      [["hornet", 4, 1.6]],
      [["wisp", 10, 0.9], ["splitter", 5, 1.5, 4]],
      [["hornet", 7, 1.2], ["flitter", 8, 0.9, 4]],
      [["brute", 9, 1.4], ["scurrier", 16, 0.35, 5]],
      [["hornet", 9, 1.0], ["wisp", 8, 1.0, 5]],
      [["splitter", 10, 1.1], ["brute", 6, 1.7, 4]],
      [["hornet", 11, 0.9], ["flitter", 10, 0.8, 4]],
      [["brute", 10, 1.3], ["hornet", 8, 1.1, 5], ["scurrier", 20, 0.3, 9]],
    ],
  },
  {
    name: "The Furnace", region: 1, gold: 180, lives: 18, hpMul: 1.65,
    path: [[3, -1], [3, 1], [8, 1], [8, 4], [1, 4], [1, 7], [6, 7], [6, 10], [2, 10], [2, 12], [8, 12], [8, 14]],
    rocks: [[5, 2], [6, 2], [0, 9], [9, 9], [4, 11]],
    hint: "Tesla Coils chain between monsters — put one where the road doubles back.",
    waves: [
      [["scurrier", 20, 0.3], ["brute", 4, 2.0, 5]],
      [["hornet", 6, 1.3]],
      [["splitter", 10, 1.1], ["wisp", 6, 1.2, 4]],
      [["brute", 10, 1.3]],
      [["hornet", 9, 1.0], ["scurrier", 18, 0.32, 4]],
      [["wisp", 12, 0.8], ["flitter", 10, 0.8, 4]],
      [["brute", 10, 1.3], ["splitter", 8, 1.2, 4]],
      [["hornet", 12, 0.85], ["wisp", 10, 0.9, 5]],
      [["splitter", 12, 1.0], ["brute", 8, 1.5, 4], ["scurrier", 18, 0.3, 9]],
      [["brute", 12, 1.2], ["hornet", 10, 0.95, 4], ["flitter", 10, 0.8, 8]],
    ],
  },
  {
    name: "Ashfall Pass", region: 1, gold: 185, lives: 18, hpMul: 1.8,
    path: [[6, -1], [6, 2], [1, 2], [1, 5], [8, 5], [8, 8], [3, 8], [3, 11], [9, 11], [9, 14]],
    rocks: [[4, 3], [4, 4], [0, 7], [1, 7], [6, 10], [7, 10]],
    hint: "Sell a turret you regret — you get most of the gold back.",
    waves: [
      [["brute", 8, 1.5], ["scurrier", 16, 0.35, 4]],
      [["hornet", 8, 1.1]],
      [["wisp", 14, 0.75]],
      [["splitter", 12, 1.0], ["flitter", 8, 0.9, 5]],
      [["brute", 12, 1.2]],
      [["hornet", 12, 0.85], ["scurrier", 20, 0.3, 4]],
      [["wisp", 14, 0.75], ["splitter", 10, 1.1, 5]],
      [["brute", 12, 1.2], ["hornet", 10, 0.95, 4]],
      [["flitter", 16, 0.6], ["wisp", 12, 0.8, 5]],
      [["brute", 14, 1.1], ["splitter", 12, 1.0, 4], ["hornet", 10, 0.95, 9]],
    ],
  },
  {
    name: "Titan's Gate", region: 1, gold: 220, lives: 18, hpMul: 1.9, boss: "titan",
    path: [[4, -1], [4, 2], [9, 2], [9, 5], [2, 5], [2, 8], [7, 8], [7, 11], [1, 11], [1, 14]],
    rocks: [[0, 1], [1, 1], [6, 3], [6, 4], [0, 9], [9, 9], [9, 10]],
    hint: "The Stone Titan shrugs off the cold and wears thick armour. Bring Watchtowers.",
    waves: [
      [["brute", 10, 1.3], ["scurrier", 18, 0.32, 4]],
      [["hornet", 10, 0.95]],
      [["wisp", 14, 0.75], ["splitter", 8, 1.2, 5]],
      [["brute", 14, 1.1]],
      [["hornet", 12, 0.85], ["flitter", 12, 0.75, 4]],
      [["splitter", 14, 0.9], ["wisp", 12, 0.8, 5]],
      [["brute", 14, 1.1], ["hornet", 10, 0.95, 4]],
      [["scurrier", 30, 0.24], ["brute", 10, 1.3, 6]],
      [["hornet", 14, 0.8], ["wisp", 14, 0.75, 4]],
      [["titan", 1, 1]],
    ],
  },

  /* ---------------- Region 3 — Frostfell ---------------- */
  {
    name: "Frozen Ford", region: 2, gold: 215, lives: 16, hpMul: 2.0,
    path: [[2, -1], [2, 3], [7, 3], [7, 6], [1, 6], [1, 9], [8, 9], [8, 12], [4, 12], [4, 14]],
    rocks: [[4, 1], [5, 1], [9, 6], [9, 7], [0, 11], [6, 10]],
    hint: "Fewer lives up here. One leak matters.",
    waves: [
      [["brute", 12, 1.2], ["scurrier", 20, 0.3, 4]],
      [["hornet", 12, 0.85]],
      [["wisp", 16, 0.7], ["splitter", 10, 1.1, 5]],
      [["brute", 16, 1.0]],
      [["flitter", 18, 0.55], ["hornet", 10, 0.95, 5]],
      [["splitter", 16, 0.85], ["brute", 10, 1.3, 5]],
      [["wisp", 18, 0.65], ["hornet", 12, 0.85, 5]],
      [["brute", 16, 1.0], ["scurrier", 26, 0.26, 5]],
      [["hornet", 16, 0.7], ["flitter", 16, 0.6, 4]],
      [["brute", 16, 1.0], ["splitter", 14, 0.9, 4], ["wisp", 14, 0.75, 9]],
    ],
  },
  {
    name: "Glacier Run", region: 2, gold: 225, lives: 16, hpMul: 2.1,
    path: [[7, -1], [7, 1], [2, 1], [2, 4], [8, 4], [8, 7], [3, 7], [3, 10], [9, 10], [9, 13], [5, 13], [5, 14]],
    rocks: [[5, 2], [5, 3], [0, 5], [0, 6], [6, 12], [7, 12]],
    hint: "Send a wave early with ▶▶ for bonus gold — if you dare.",
    waves: [
      [["scurrier", 26, 0.26], ["brute", 8, 1.5, 5]],
      [["hornet", 14, 0.8]],
      [["splitter", 16, 0.85], ["wisp", 12, 0.8, 5]],
      [["brute", 18, 0.95]],
      [["hornet", 16, 0.7], ["flitter", 16, 0.6, 4]],
      [["wisp", 20, 0.6], ["splitter", 12, 1.0, 5]],
      [["brute", 18, 0.95], ["hornet", 12, 0.85, 5]],
      [["flitter", 22, 0.45], ["scurrier", 26, 0.26, 5]],
      [["splitter", 18, 0.8], ["brute", 14, 1.1, 5]],
      [["hornet", 18, 0.65], ["wisp", 18, 0.65, 4], ["brute", 12, 1.2, 9]],
    ],
  },
  {
    name: "The Long Cold", region: 2, gold: 235, lives: 16, hpMul: 2.2,
    path: [[1, -1], [1, 2], [8, 2], [8, 5], [1, 5], [1, 8], [8, 8], [8, 11], [1, 11], [1, 14]],
    rocks: [[4, 3], [5, 3], [4, 6], [5, 6], [4, 9], [5, 9]],
    hint: "The road coils back on itself four times. One good Tesla Coil covers three of them.",
    waves: [
      [["brute", 14, 1.1], ["hornet", 10, 0.95, 5]],
      [["wisp", 20, 0.6]],
      [["splitter", 18, 0.8], ["scurrier", 24, 0.28, 5]],
      [["hornet", 18, 0.65]],
      [["brute", 20, 0.9], ["flitter", 14, 0.7, 5]],
      [["wisp", 22, 0.55], ["splitter", 14, 0.9, 5]],
      [["hornet", 20, 0.6], ["brute", 12, 1.2, 5]],
      [["flitter", 24, 0.42], ["wisp", 16, 0.7, 5]],
      [["brute", 20, 0.9], ["splitter", 16, 0.85, 4], ["scurrier", 24, 0.28, 9]],
      [["hornet", 22, 0.55], ["brute", 16, 1.0, 4], ["wisp", 16, 0.7, 9]],
    ],
  },
  {
    name: "Whiteout", region: 2, gold: 255, lives: 16, hpMul: 2.3,
    path: [[5, -1], [5, 2], [1, 2], [1, 5], [6, 5], [6, 8], [2, 8], [2, 11], [8, 11], [8, 14]],
    rocks: [[8, 2], [8, 3], [9, 6], [9, 7], [0, 9], [4, 12], [5, 12]],
    hint: "A short road and a lot of monsters. Everything has to earn its square.",
    waves: [
      [["brute", 16, 1.0], ["hornet", 12, 0.85, 5]],
      [["wisp", 22, 0.55], ["flitter", 14, 0.7, 5]],
      [["splitter", 20, 0.75], ["brute", 12, 1.2, 5]],
      [["hornet", 22, 0.55]],
      [["brute", 22, 0.85], ["scurrier", 26, 0.26, 5]],
      [["wisp", 24, 0.5], ["splitter", 16, 0.85, 5]],
      [["hornet", 22, 0.55], ["flitter", 20, 0.5, 5]],
      [["brute", 24, 0.8], ["hornet", 14, 0.8, 5]],
      [["splitter", 22, 0.7], ["wisp", 20, 0.6, 4], ["flitter", 18, 0.55, 9]],
      [["brute", 24, 0.8], ["hornet", 20, 0.6, 4], ["splitter", 18, 0.8, 9]],
    ],
  },
  {
    name: "Warlord's Advance", region: 2, gold: 320, lives: 20, hpMul: 2.1, boss: "warlord",
    path: [[4, -1], [4, 1], [9, 1], [9, 4], [2, 4], [2, 7], [7, 7], [7, 10], [1, 10], [1, 13], [6, 13], [6, 14]],
    rocks: [[0, 0], [1, 0], [0, 2], [0, 3], [5, 2], [6, 2], [4, 5], [5, 5], [9, 8], [9, 9], [8, 12]],
    hint: "The Goblin Warlord drops fresh Scurriers as it walks. Clear the road behind it.",
    waves: [
      [["brute", 18, 0.95], ["hornet", 14, 0.8, 5]],
      [["wisp", 24, 0.5], ["splitter", 14, 0.9, 5]],
      [["hornet", 24, 0.5], ["flitter", 18, 0.55, 5]],
      [["brute", 24, 0.8], ["scurrier", 30, 0.24, 5]],
      [["splitter", 24, 0.65], ["wisp", 18, 0.65, 5]],
      [["hornet", 26, 0.45], ["brute", 16, 1.0, 5]],
      [["flitter", 28, 0.4], ["wisp", 22, 0.55, 5]],
      [["brute", 26, 0.75], ["hornet", 18, 0.65, 4], ["splitter", 16, 0.85, 9]],
      [["hornet", 28, 0.42], ["brute", 20, 0.9, 4], ["wisp", 20, 0.6, 9]],
      [["warlord", 1, 1]],
    ],
  },
];

// Seconds of quiet between waves, and what rushing one early pays.
const BREATHER = 10;
const RUSH_GOLD_PER_SEC = 2;
const WAVE_GOLD = (i) => 12 + i * 3;

/* ---------------- Siege: the endless leaderboard mode ----------------
   No level list and no RNG — wave N is a pure function of N. Monster health
   climbs 13% a wave with no ceiling while your income only grows linearly, so a
   perfect player still drowns eventually. That is deliberate: an endless mode
   bounded only by mistakes never ends for a good player, and then there is no
   score to put on a leaderboard. */
const SIEGE = {
  name: "The Long Siege",
  gold: 200, lives: 20,
  path: [[5, -1], [5, 2], [1, 2], [1, 5], [8, 5], [8, 8], [2, 8], [2, 11], [7, 11], [7, 14]],
  rocks: [[0, 0], [9, 0], [4, 6], [5, 6], [0, 13], [9, 13]],
  hpGrowth: 1.13,

  // The roster opens up as the waves climb, then loops with everything in it.
  waveAt(i) {
    const roster = [
      ["slug", 0], ["scurrier", 0], ["brute", 3], ["flitter", 5],
      ["splitter", 8], ["wisp", 11], ["hornet", 14],
    ].filter(([, from]) => i >= from).map(([id]) => id);

    // Every fifth wave is a boss, cycling through the three of them.
    if (i > 0 && i % 5 === 4) {
      const boss = ["dragon", "titan", "warlord"][Math.floor(i / 5) % 3];
      return [[boss, 1 + Math.floor(i / 15), 3]];
    }

    const groups = [];
    const kinds = Math.min(roster.length, 1 + Math.floor(i / 2));
    for (let k = 0; k < kinds; k++) {
      const id = roster[(i + k * 3) % roster.length];
      const n = 4 + Math.floor(i * 0.8) + k * 2;
      const gap = Math.max(0.22, 0.9 - i * 0.03);
      groups.push([id, n, gap, k * 3]);
    }
    return groups;
  },
};

if (typeof module !== "undefined") {
  module.exports = { LEVELS, REGIONS, COLS, ROWS, BREATHER, RUSH_GOLD_PER_SEC, WAVE_GOLD, SIEGE };
}
