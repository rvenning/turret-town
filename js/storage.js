// Turret Town — persistence: gamekit storage configured for this game.
// tt_* localStorage keys, "turrettown" Firestore collection.
//
// Coins are SPENT in the armoury, so a plain max() merge would resurrect spent
// coins the first time two devices sync. Both halves of the ledger are monotonic
// counters that only ever grow, and the balance is derived — which makes max()
// always safe.
//
// PROGRESS is a named object rather than two inline callbacks, because
// createStorage keeps them in a closure and tests/storage.test.js needs to call
// the merge directly: it is the one function here that can destroy a save.

const SIEGE_UNLOCK_LEVELS = 5;

const PROGRESS = {
  blank: () => ({
    coinsEarned: 0, coinsSpent: 0,
    levels: {},          // { [idx]: { score, stars } } — best result per map
    upgrades: {},        // { [upgradeId]: level }
    siegeBest: 0,        // waves survived in the longest siege
    siegeScore: 0,       // the leaderboard number
    updated: 0,
  }),

  merge: (a, b) => {
    const levels = { ...(a.levels || {}) };
    for (const [idx, l] of Object.entries(b.levels || {})) {
      const cur = levels[idx];
      levels[idx] = cur
        ? { score: Math.max(cur.score || 0, l.score || 0), stars: Math.max(cur.stars || 0, l.stars || 0) }
        : l;
    }
    const upgrades = { ...(a.upgrades || {}) };
    for (const [id, lvl] of Object.entries(b.upgrades || {})) {
      upgrades[id] = Math.max(upgrades[id] || 0, lvl);
    }
    return {
      // Spread first, so a field a newer build added survives an older client's merge.
      ...a, ...b,
      coinsEarned: Math.max(a.coinsEarned || 0, b.coinsEarned || 0),
      coinsSpent: Math.max(a.coinsSpent || 0, b.coinsSpent || 0),
      siegeBest: Math.max(a.siegeBest || 0, b.siegeBest || 0),
      siegeScore: Math.max(a.siegeScore || 0, b.siegeScore || 0),
      levels, upgrades,
    };
  },
};

const Storage = GK.createStorage({
  prefix: "tt",
  collection: "turrettown",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

/* ----- Turret Town helpers on top of the kit storage ----- */
Object.assign(Storage, {
  coins(prog) { return Math.max(0, (prog.coinsEarned || 0) - (prog.coinsSpent || 0)); },

  totalStars(prog) {
    return Object.values(prog.levels || {}).reduce((s, l) => s + (l.stars || 0), 0);
  },

  levelsWon(prog) { return Object.keys(prog.levels || {}).length; },

  // Maps unlock in order: the one after the furthest cleared.
  unlockedLevel(prog) {
    let max = -1;
    for (const k of Object.keys(prog.levels || {})) max = Math.max(max, Number(k));
    return Math.min(max + 1, LEVELS.length - 1);
  },

  siegeUnlocked(prog) { return this.levelsWon(prog) >= SIEGE_UNLOCK_LEVELS; },

  recordRun(profileId, result) {
    const prog = this.getProgress(profileId);
    const beaten = result.mode === "level" && !!(prog.levels || {})[result.levelIdx];

    if (result.mode === "siege") {
      prog.siegeBest = Math.max(prog.siegeBest || 0, result.wavesCleared || 0);
      prog.siegeScore = Math.max(prog.siegeScore || 0, result.score || 0);
    } else if (result.win) {
      // Only a WIN is recorded — recording a loss would unlock the next map.
      const cur = (prog.levels || {})[result.levelIdx];
      prog.levels = prog.levels || {};
      prog.levels[result.levelIdx] = {
        score: Math.max((cur && cur.score) || 0, result.score || 0),
        stars: Math.max((cur && cur.stars) || 0, result.stars || 0),
      };
    }

    const coins = coinsFor(result, beaten);
    if (coins > 0) prog.coinsEarned = (prog.coinsEarned || 0) + coins;
    this.saveProgress(profileId, prog);
    return { progress: prog, coins };
  },

  buyUpgrade(profileId, id) {
    const prog = this.getProgress(profileId);
    const def = UPGRADE_BY_ID[id];
    const lvl = upgradeLevel(prog, id);
    if (!def || lvl >= def.costs.length) return { ok: false, reason: "maxed" };
    const cost = def.costs[lvl];
    if (this.coins(prog) < cost) return { ok: false, reason: "coins" };
    prog.coinsSpent = (prog.coinsSpent || 0) + cost;
    prog.upgrades = prog.upgrades || {};
    prog.upgrades[id] = lvl + 1;
    this.saveProgress(profileId, prog);
    return { ok: true, progress: prog, cost };
  },
});
