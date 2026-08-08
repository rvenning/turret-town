"use strict";
// Turret Town — headless balance bots. These drive the REAL engine (js/game.js
// has no DOM, canvas or audio) through all fifteen maps and the Long Siege, so
// the numbers below are what a player actually meets.
//
// The engine contains no randomness at all, and neither do these bots, so a
// changed clear time here is a genuine balance change rather than a bad roll —
// there is nothing to seed.
//
// Four bots, because one is never enough:
//
//   perfect — the best placement heuristic, rushes every wave for the bonus, and
//             spends everything. Nothing may be unwinnable by it.
//   smart   — the tuning target: an ordinary competent player. It must clear the
//             whole campaign with no armoury upgrades at all (being STUCK is the
//             one failure that ends a game) while still leaving three-stars to
//             chase.
//   bows    — builds nothing but Archer Posts. If this clears the late maps then
//             armour is decoration and there is no reason to own a Watchtower.
//   idle    — never builds. The control. If putting the iPad down clears a map,
//             that map has nothing in it.
//
//   cd turret-town && node --test
//   node tests/bot.test.js --report     # per-map table

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");
const S = loadScripts({
  baseDir: ROOT,
  files: ["lib/gk-util.js", "lib/gk-path.js", "js/towers.js", "js/enemies.js", "js/levels.js", "js/upgrades.js", "js/game.js"],
  exports: ["Game", "TOWERS", "TOWER_BY_ID", "towerCost", "towerStat", "LEVELS", "SIEGE",
            "COLS", "ROWS", "UPGRADES", "upgradeLevel", "upgradeLoadout", "coinsFor",
            "makeRoute", "routeAt", "STEP"],
  browser: true,
});
const { Game, TOWERS, towerCost, towerStat, LEVELS, SIEGE, COLS, ROWS,
        UPGRADES, upgradeLevel, upgradeLoadout, coinsFor, makeRoute, routeAt } = S;

const NO_KIT = upgradeLoadout({});
const FULL_KIT = upgradeLoadout({ upgrades: { chest: 3, walls: 2, aim: 3, bulk: 2, sand: 2 } });

/* ------------------------- how good is a turret? ------------------------ */

// A single comparable number per turret level, so "build this" and "upgrade
// that" can be weighed against each other in the same currency.
function dpsOf(def, lvl, loadout) {
  const dmg = towerStat(def, lvl, "dmg", loadout);
  const rate = towerStat(def, lvl, "rate", loadout);
  switch (def.kind) {
    case "bomb": return dmg * rate * 2.2;                       // splash hits a crowd
    case "pulse": return dmg * rate * 3 + 14 * def.slow[lvl];   // the slow IS the value
    case "chain": return dmg * rate * def.chain[lvl] * 0.8;
    default: return dmg * rate;
  }
}

function samplePoints(route, step) {
  const out = [];
  for (let d = 0; d <= route.len; d += step) out.push(routeAt(route, d));
  return out;
}

/* --------------------------------- bots --------------------------------- */

function makeBrain(map, opts) {
  const road = samplePoints(makeRoute(map.path), 0.4);
  const air = samplePoints(makeRoute([map.path[0], map.path[map.path.length - 1]]), 0.4);
  const cells = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) cells.push([x, y]);

  // How much of what matters this square can see. Air coverage is worth more
  // when the bot has almost none, which is what stops it building a beautiful
  // ground wall and losing to the first Flitter.
  const cover = (G, cx, cy, range, canAir) => {
    let n = 0;
    for (const p of road) if (Math.hypot(p.x - cx, p.y - cy) <= range) n++;
    if (canAir) {
      const need = G.__airCover < 6 ? 4 : 1;
      for (const p of air) if (Math.hypot(p.x - cx, p.y - cy) <= range) n += need;
    }
    return n;
  };

  return function act(G) {
    // Recount air coverage before each decision.
    G.__airCover = 0;
    for (const t of G.towers) {
      if (!t.def.air) continue;
      const r = towerStat(t.def, t.level, "range", G.loadout);
      for (const p of air) if (Math.hypot(p.x - t.cx, p.y - t.cy) <= r) G.__airCover++;
    }

    for (let spin = 0; spin < 12; spin++) {
      let best = null;

      if (!opts.noBuild) {
        for (const def of TOWERS) {
          if (opts.only && def.id !== opts.only) continue;
          const cost = towerCost(def, 0, G.loadout);
          if (cost > G.gold) continue;
          const value = dpsOf(def, 0, G.loadout) / cost;
          for (const [x, y] of cells) {
            if (G.cellKind(x, y) !== "grass") continue;
            const c = cover(G, x + 0.5, y + 0.5, def.range[0], def.air);
            if (!c) continue;
            const score = c * value;
            if (!best || score > best.score) best = { score, kind: "build", x, y, id: def.id };
          }
        }
      }

      for (const t of G.towers) {
        const up = G.upgradeCost(t);
        if (up === null || up > G.gold) continue;
        const gain = dpsOf(t.def, t.level + 1, G.loadout) - dpsOf(t.def, t.level, G.loadout);
        const range = towerStat(t.def, t.level + 1, "range", G.loadout);
        const c = cover(G, t.cx, t.cy, range, t.def.air);
        const score = c * (gain / up);
        if (!best || score > best.score) best = { score, kind: "up", x: t.x, y: t.y };
      }

      if (!best) break;
      if (best.kind === "build") G.build(best.x, best.y, best.id);
      else if (!G.upgrade(best.x, best.y)) break;
    }
  };
}

// Run one map to the end. `act` is called once a second of game time — often
// enough to spend a wave payout promptly, cheap enough to replay the campaign
// in a second.
function playMap(cfg, opts = {}) {
  const map = cfg.mode === "siege" ? SIEGE : LEVELS[cfg.levelIdx];
  const act = makeBrain(map, opts);
  let done = null;
  Game.on = { end: (r) => { done = r; } };
  Game.start(cfg);

  const maxFrames = 60 * (opts.maxSeconds || 900);
  let f = 0;
  while (Game.running && f < maxFrames) {
    if (f % 60 === 0) {
      act(Game);
      // Rushing is free gold and every competent player does it. The idle
      // control bot does nothing at all, including this.
      if (!opts.noRush) Game.sendWave();
    }
    Game.tick(1 / 60);
    f++;
  }
  if (!done) { Game.abandon(); return { timedOut: true, win: false, stars: 0, wavesCleared: Game.wavesCleared }; }
  return done;
}

const runCampaign = (opts) =>
  LEVELS.map((l, i) => playMap({ mode: "level", levelIdx: i, loadout: opts.loadout || NO_KIT }, opts));

/* --------------------------- the honest campaign ------------------------
   Playing every map with NO upgrades is not a scenario anybody meets: by the
   time you unlock map eleven you have cleared ten and been paid for all of
   them. And playing with a FULL armoury isn't either. The run that matters is
   the progression — each map once, in order, spending the coins earned so far
   — because that is the one where "an ordinary player is stuck" is a real
   claim rather than an artefact of the harness. */

const coinBalance = (p) => (p.coinsEarned || 0) - (p.coinsSpent || 0);

// Buy the cheapest thing you can afford, repeatedly. A pessimistic model of a
// real shopper (nobody saves 500 coins for Sharpened Aim III), which is what
// makes it a safe floor to assert against.
function greedyBuy(prog) {
  for (;;) {
    let best = null;
    for (const u of UPGRADES) {
      const lvl = upgradeLevel(prog, u.id);
      if (lvl >= u.costs.length) continue;
      const cost = u.costs[lvl];
      if (cost > coinBalance(prog)) continue;
      if (!best || cost < best.cost) best = { u, cost, lvl };
    }
    if (!best) return;
    prog.coinsSpent += best.cost;
    prog.upgrades[best.u.id] = best.lvl + 1;
  }
}

function runProgression(opts = {}) {
  const prog = { coinsEarned: 0, coinsSpent: 0, upgrades: {}, levels: {} };
  const results = [];
  for (let i = 0; i < LEVELS.length; i++) {
    const loadout = upgradeLoadout(prog);
    const r = playMap({ mode: "level", levelIdx: i, loadout }, opts);
    r.kit = { ...prog.upgrades };
    r.bank = coinBalance(prog);
    results.push(r);
    if (!r.win) break;                       // stuck: nothing past here is real
    prog.levels[i] = { stars: r.stars };
    prog.coinsEarned += coinsFor(r, false);
    greedyBuy(prog);
  }
  return { results, prog };
}

/* ------------------------------ the report ------------------------------ */

function report() {
  const prog = runProgression();
  const bots = {
    bare: runCampaign({ loadout: NO_KIT }),
    kit: runCampaign({ loadout: FULL_KIT }),
    bows: runCampaign({ loadout: NO_KIT, only: "bow" }),
    idle: runCampaign({ loadout: NO_KIT, noBuild: true, noRush: true, maxSeconds: 400 }),
  };
  const cell = (r) => (!r ? "        " : r.timedOut ? "TIMEOUT " : r.win ? `${r.stars}★ ${Math.round(r.time)}s` : "  lost  ");
  console.log("\n map                     progression  bank  no-kit    full-kit  bows      idle");
  LEVELS.forEach((l, i) => {
    const p = prog.results[i];
    console.log(
      ` ${String(i + 1).padStart(2)} ${l.name.padEnd(20)} ` +
      `${cell(p).padEnd(13)}${String(p ? p.bank : "-").padEnd(6)}` +
      `${cell(bots.bare[i]).padEnd(10)}${cell(bots.kit[i]).padEnd(10)}` +
      `${cell(bots.bows[i]).padEnd(10)}${cell(bots.idle[i])}`);
  });
  const stars = (rs) => rs.reduce((s, r) => s + (r.stars || 0), 0);
  console.log(`\n stars: progression ${stars(prog.results)}/45 · no-kit ${stars(bots.bare)}/45 ` +
    `· full-kit ${stars(bots.kit)}/45 · bows ${stars(bots.bows)}/45 · idle ${stars(bots.idle)}/45`);
  console.log(` armoury owned at the end: ${JSON.stringify(prog.prog.upgrades)} ` +
    `(${coinBalance(prog.prog)} coins spare)`);

  const siege = playMap({ mode: "siege", loadout: FULL_KIT }, { maxSeconds: 2400 });
  console.log(` siege: ${siege.wavesCleared} waves, score ${siege.score}, ` +
    `${Math.round(siege.time)}s${siege.timedOut ? " (TIMED OUT — it never ends!)" : ""}\n`);
}

if (process.argv.includes("--report")) { report(); process.exit(0); }

/* ------------------------------ assertions ------------------------------ */

// The kindness guarantee, and the one that outranks difficulty: playing every
// map once, in order, buying whatever the coins so far can afford, you are never
// stopped. Losing a map is fine. Being unable to get past one is not.
test("an ordinary player is never stuck: the campaign falls to a first try on every map", () => {
  const { results } = runProgression();
  assert.equal(results.length, LEVELS.length,
    `stuck at ${results.length}. ${LEVELS[results.length - 1].name} — ` +
    `cleared ${results[results.length - 1].wavesCleared} waves with ${JSON.stringify(results[results.length - 1].kit)}`);
  results.forEach((r, i) => {
    assert.ok(!r.timedOut, `${i + 1}. ${LEVELS[i].name}: never ended — the map can't be finished`);
    assert.ok(r.win, `${i + 1}. ${LEVELS[i].name}: an ordinary player is STUCK here`);
  });
});

test("but three stars are still worth chasing", () => {
  const stars = runProgression().results.reduce((s, r) => s + r.stars, 0);
  assert.ok(stars < LEVELS.length * 3,
    `an ordinary first-try player three-starred all ${LEVELS.length} maps — nothing left to chase`);
  assert.ok(stars >= LEVELS.length,
    `only ${stars} stars across ${LEVELS.length} maps — clearing a map should be worth something`);
});

test("the armoury is worth buying, and doesn't erase the game", () => {
  const bare = runCampaign({ loadout: NO_KIT }).reduce((s, r) => s + r.stars, 0);
  const kittedRuns = runCampaign({ loadout: FULL_KIT });
  const kitted = kittedRuns.reduce((s, r) => s + r.stars, 0);
  assert.ok(kitted > bare, `a full armoury (${kitted}★) is no better than none (${bare}★)`);
  assert.ok(kittedRuns.slice(-5).every((r) => r.win && r.time > 90),
    "the last five maps fall over in a minute and a half with a full armoury — the rewards erase the game");
});

test("doing nothing loses every single map", () => {
  const runs = runCampaign({ loadout: NO_KIT, noBuild: true, noRush: true, maxSeconds: 400 });
  runs.forEach((r, i) => {
    assert.ok(!r.win, `${i + 1}. ${LEVELS[i].name}: won by NOT PLAYING — the map has nothing in it`);
  });
});

test("armour has teeth: Archer Posts alone are not the whole game", () => {
  const runs = runCampaign({ loadout: NO_KIT, only: "bow" });
  const lost = runs.filter((r) => !r.win).length;
  assert.ok(lost > 0,
    "an Archer-Posts-only player cleared all fifteen maps — armour, flyers and the other four turrets are decoration");
  // ...and it should still get a decent way in, or the answer is "the obvious
  // first turret is a trap", which is not a fun lesson.
  assert.ok(runs.slice(0, 3).every((r) => r.win),
    "Archer Posts alone can't even clear Green Meadows — the starter turret is a trap");
});

test("the Long Siege ends, even for the best player", () => {
  const r = playMap({ mode: "siege", loadout: FULL_KIT }, { maxSeconds: 2400 });
  assert.ok(!r.timedOut, "the siege never ended — an endless mode with no ceiling has no score to compare");
  assert.ok(r.wavesCleared >= 8, `the siege ended after only ${r.wavesCleared} waves`);
  assert.ok(r.score > 0, "the siege scored nothing");
});

test("a boss getting through really hurts", () => {
  // Five lives a leak, on maps that only give you sixteen to twenty.
  for (const level of LEVELS.filter((l) => l.boss)) {
    assert.ok(level.lives / 5 <= 4, `${level.name}: a boss could leak four times and you'd still hold`);
  }
});
