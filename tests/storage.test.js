"use strict";
// Save-data tests. These cover the code that can permanently ruin a player's
// progress rather than merely annoy them: the cross-device merge (which runs
// unattended whenever two iPads sync) and the coin ledger (which has to make
// spending survive a max() merge).
//
//   cd turret-town && node --test

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

// Fresh sandbox per call: gk-storage keeps state and localStorage is faked per
// sandbox, so tests can't leak into each other.
function load() {
  return loadScripts({
    baseDir: ROOT,
    files: ["lib/gk-util.js", "lib/gk-storage.js", "js/towers.js", "js/enemies.js",
            "js/levels.js", "js/upgrades.js", "js/storage.js"],
    exports: ["Storage", "PROGRESS", "UPGRADES", "upgradeLevel", "upgradeLoadout",
              "LEVELS", "coinsFor", "SIEGE_UNLOCK_LEVELS"],
    browser: true,
  });
}

/* -------------------------------- the merge ------------------------------ */

test("merge keeps the best score and the best stars for every map", () => {
  const { PROGRESS } = load();
  const a = { ...PROGRESS.blank(), levels: { 0: { score: 900, stars: 3 }, 1: { score: 400, stars: 1 } } };
  const b = { ...PROGRESS.blank(), levels: { 1: { score: 700, stars: 2 }, 2: { score: 100, stars: 1 } } };
  const m = PROGRESS.merge(a, b);
  assert.deepEqual(m.levels[0], { score: 900, stars: 3 }, "a map only one device has must survive");
  assert.deepEqual(m.levels[1], { score: 700, stars: 2 }, "the better result must win");
  assert.deepEqual(m.levels[2], { score: 100, stars: 1 });
});

test("merge takes the best of each half of a split result", () => {
  const { PROGRESS } = load();
  // One device three-starred it scrappily; the other scored higher but leaked.
  const a = { ...PROGRESS.blank(), levels: { 4: { score: 1200, stars: 3 } } };
  const b = { ...PROGRESS.blank(), levels: { 4: { score: 2600, stars: 1 } } };
  const m = PROGRESS.merge(a, b);
  assert.deepEqual(m.levels[4], { score: 2600, stars: 3 });
});

test("merge keeps the higher armoury level, never the older one", () => {
  const { PROGRESS } = load();
  const a = { ...PROGRESS.blank(), upgrades: { aim: 3, chest: 1 } };
  const b = { ...PROGRESS.blank(), upgrades: { aim: 1, walls: 2 } };
  const m = PROGRESS.merge(a, b);
  assert.deepEqual(m.upgrades, { aim: 3, chest: 1, walls: 2 });
});

test("spent coins stay spent after a sync with a stale device", () => {
  const { PROGRESS } = load();
  // This device earned 500 and spent 300. The other is a week behind: it has
  // only seen 400 earned and nothing spent. A stored BALANCE would come back as
  // 400 here — free money on every sync. Two monotonic counters cannot do that.
  const here = { ...PROGRESS.blank(), coinsEarned: 500, coinsSpent: 300 };
  const stale = { ...PROGRESS.blank(), coinsEarned: 400, coinsSpent: 0 };
  const m = PROGRESS.merge(here, stale);
  assert.equal(m.coinsEarned, 500);
  assert.equal(m.coinsSpent, 300);
  assert.equal(m.coinsEarned - m.coinsSpent, 200, "the balance must not grow by merging");
});

test("merge never drops a field a newer build added", () => {
  const { PROGRESS } = load();
  const a = { ...PROGRESS.blank(), somethingNew: 42 };
  const b = PROGRESS.blank();
  assert.equal(PROGRESS.merge(a, b).somethingNew, 42);
  assert.equal(PROGRESS.merge(b, a).somethingNew, 42);
});

test("merge keeps the best siege run", () => {
  const { PROGRESS } = load();
  const a = { ...PROGRESS.blank(), siegeBest: 14, siegeScore: 2100 };
  const b = { ...PROGRESS.blank(), siegeBest: 9, siegeScore: 2600 };
  const m = PROGRESS.merge(a, b);
  assert.equal(m.siegeBest, 14);
  assert.equal(m.siegeScore, 2600);
});

/* ------------------------------- progression ----------------------------- */

test("maps unlock in order and only a WIN unlocks the next one", () => {
  const { Storage } = load();
  assert.equal(Storage.unlockedLevel({ levels: {} }), 0);
  assert.equal(Storage.unlockedLevel({ levels: { 0: { stars: 1 } } }), 1);
  // A loss is never recorded, so it can't open the next map.
  assert.equal(Storage.unlockedLevel({ levels: { 0: { stars: 1 }, 3: { stars: 2 } } }), 4,
    "the furthest cleared map decides what's open");
});

test("the siege stays locked until enough maps are held", () => {
  const { Storage, SIEGE_UNLOCK_LEVELS } = load();
  const levels = {};
  for (let i = 0; i < SIEGE_UNLOCK_LEVELS - 1; i++) levels[i] = { stars: 1 };
  assert.equal(Storage.siegeUnlocked({ levels }), false);
  levels[SIEGE_UNLOCK_LEVELS - 1] = { stars: 1 };
  assert.equal(Storage.siegeUnlocked({ levels }), true);
});

test("losing a map pays no coins, and the first clear pays a bonus once", () => {
  const { coinsFor } = load();
  assert.equal(coinsFor({ mode: "level", win: false, stars: 0 }, false), 0);
  const first = coinsFor({ mode: "level", win: true, stars: 3 }, false);
  const again = coinsFor({ mode: "level", win: true, stars: 3 }, true);
  assert.ok(first > again, "the first clear should be worth more than a replay");
  assert.ok(again > 0, "a replay should still be worth something");
});

test("the armoury loadout adds up exactly what was bought", () => {
  const { upgradeLoadout, UPGRADES } = load();
  assert.deepEqual(upgradeLoadout({}), { gold: 0, lives: 0, power: 0, discount: 0, sandbags: 0 });
  const full = {};
  for (const u of UPGRADES) full[u.id] = u.costs.length;
  const kit = upgradeLoadout({ upgrades: full });
  for (const key of Object.keys(kit)) assert.ok(kit[key] > 0, `${key} should be improved by a full armoury`);
  // A level-2 upgrade is the level-2 VALUE, not level 1 plus level 2.
  const chest = UPGRADES.find((u) => u.id === "chest");
  assert.equal(upgradeLoadout({ upgrades: { chest: 2 } }).gold, chest.gold[1]);
});
