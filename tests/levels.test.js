"use strict";
// Turret Town — the map and data linter.
//
// Maps are waypoint lists rather than hand-counted ASCII, so the mistakes
// available are geometric: a leg that isn't axis-aligned, a corner off the
// board, a road that crosses itself, a rock sitting on the road, or a flyer lane
// that passes nowhere you could ever put a turret. Every one of those ships a
// map that looks fine and plays wrong, and every one is checkable.
//
//   cd turret-town && node --test

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");
const S = loadScripts({
  baseDir: ROOT,
  files: ["lib/gk-util.js", "lib/gk-path.js", "js/towers.js", "js/enemies.js", "js/levels.js", "js/upgrades.js", "js/game.js"],
  exports: ["TOWERS", "TOWER_BY_ID", "ENEMIES", "ENEMY_BY_ID", "LEVELS", "REGIONS",
            "COLS", "ROWS", "SIEGE", "UPGRADES", "makeRoute", "routeCells", "Game", "GK"],
  browser: true,
});
const { TOWERS, ENEMIES, ENEMY_BY_ID, LEVELS, REGIONS, COLS, ROWS, SIEGE, UPGRADES,
        makeRoute, routeCells, GK } = S;

const ALL_MAPS = [...LEVELS.map((l, i) => [`${i + 1}. ${l.name}`, l]), ["The Long Siege", SIEGE]];

function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }

// Distance from a point to a line segment — used for "can anything shoot the
// flyer lane?".
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function buildableCells(map) {
  const road = routeCells(map.path);
  const rocks = new Set((map.rocks || []).map(([x, y]) => x + "," + y));
  const out = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const k = x + "," + y;
      if (!road.has(k) && !rocks.has(k)) out.push([x, y]);
    }
  }
  return out;
}

/* ------------------------------- geometry ------------------------------- */

// Road geometry is gamekit's GK.Route.lint now: axis-aligned legs with real
// length, monsters entering and leaving OFF the board with every corner on it,
// and no road doubling back over itself. Collecting the failures rather than
// asserting inside the loop means one run names every bad map.
test("every road is a legal road", () => {
  const fails = [];
  for (const [label, map] of ALL_MAPS) {
    fails.push(...GK.Route.lint(map.path, {
      label, axisAligned: true, noCrossing: true,
      bounds: { w: COLS, h: ROWS },
    }));
  }
  assert.deepEqual(fails, []);
});

test("rocks are on the board and never on the road", () => {
  for (const [label, map] of ALL_MAPS) {
    const road = routeCells(map.path);
    const seen = new Set();
    for (const [x, y] of map.rocks || []) {
      assert.ok(inBounds(x, y), `${label}: rock ${x},${y} is off the board`);
      assert.ok(!road.has(x + "," + y), `${label}: rock ${x},${y} sits on the road`);
      assert.ok(!seen.has(x + "," + y), `${label}: rock ${x},${y} is listed twice`);
      seen.add(x + "," + y);
    }
  }
});

test("every map is long enough to defend and has room to build", () => {
  for (const [label, map] of ALL_MAPS) {
    const route = makeRoute(map.path);
    assert.ok(route.len >= 24, `${label}: the road is only ${route.len.toFixed(1)} cells — too short to defend`);
    const build = buildableCells(map);
    assert.ok(build.length >= 60, `${label}: only ${build.length} buildable squares`);
  }
});

// The whole point of flyers is that they ignore the road, so the lane they take
// has to pass somewhere a turret could actually reach. A map where it doesn't
// is unwinnable the moment the first Flitter appears, and nothing else catches it.
test("the flyer lane passes within reach of plenty of buildable squares", () => {
  const maxRange = Math.max(...TOWERS.filter((t) => t.air).map((t) => t.range[0]));
  for (const [label, map] of ALL_MAPS) {
    const a = map.path[0], b = map.path[map.path.length - 1];
    const near = buildableCells(map).filter(([x, y]) =>
      distToSeg(x + 0.5, y + 0.5, a[0] + 0.5, a[1] + 0.5, b[0] + 0.5, b[1] + 0.5) <= maxRange);
    assert.ok(near.length >= 10,
      `${label}: only ${near.length} buildable squares can reach the flyer lane`);
  }
});

/* --------------------------------- waves -------------------------------- */

test("every wave references a real monster and spawns something", () => {
  for (const [label, level] of LEVELS.map((l, i) => [`${i + 1}. ${l.name}`, l])) {
    assert.ok(level.waves.length >= 8, `${label}: only ${level.waves.length} waves`);
    level.waves.forEach((wave, wi) => {
      assert.ok(wave.length > 0, `${label} wave ${wi + 1}: empty`);
      for (const [id, n, gap, at] of wave) {
        assert.ok(ENEMY_BY_ID[id], `${label} wave ${wi + 1}: unknown monster "${id}"`);
        assert.ok(n > 0, `${label} wave ${wi + 1}: ${id} count must be positive`);
        assert.ok(gap > 0, `${label} wave ${wi + 1}: ${id} gap must be positive`);
        assert.ok((at || 0) >= 0, `${label} wave ${wi + 1}: ${id} start time must not be negative`);
      }
    });
  }
});

test("a boss map declares its boss and saves it for the last wave", () => {
  for (const [i, level] of LEVELS.entries()) {
    const bossWaves = level.waves
      .map((w, wi) => [wi, w.filter(([id]) => ENEMY_BY_ID[id].boss)])
      .filter(([, b]) => b.length);
    if (!level.boss) {
      assert.equal(bossWaves.length, 0, `${level.name}: has a boss in its waves but doesn't declare one`);
      continue;
    }
    assert.equal(bossWaves.length, 1, `${level.name}: a boss should appear in exactly one wave`);
    const [wi, groups] = bossWaves[0];
    assert.equal(wi, level.waves.length - 1, `${level.name}: the boss must be the last wave`);
    assert.ok(groups.some(([id]) => id === level.boss), `${level.name}: last wave is not the declared boss`);
    assert.equal(ENEMY_BY_ID[level.boss].leak, 5, `${level.boss}: a boss getting through must cost 5 lives`);
  }
});

// hpMul is the main difficulty dial but not the only one — wave counts, the
// monster mix, road length, lives and starting gold all move too, and a boss map
// carries most of its weight in the boss. So this checks the TREND (each region
// harder than the last) and forbids a collapse, rather than pinning every map
// above the one before it: Warlord's Advance dips deliberately because it also
// fields a 3400hp boss that spawns reinforcements as it walks.
test("the campaign gets harder region by region, with no collapses", () => {
  const avg = (rs) => rs.reduce((s, l) => s + l.hpMul, 0) / rs.length;
  const byRegion = REGIONS.map((_, ri) => LEVELS.filter((l) => l.region === ri));
  for (let ri = 1; ri < byRegion.length; ri++) {
    assert.ok(avg(byRegion[ri]) > avg(byRegion[ri - 1]),
      `region ${ri} is no harder on average than the one before it`);
  }
  for (let i = 1; i < LEVELS.length; i++) {
    assert.ok(LEVELS[i].hpMul >= LEVELS[i - 1].hpMul * 0.85,
      `${LEVELS[i].name}: hpMul ${LEVELS[i].hpMul} collapses from ${LEVELS[i - 1].hpMul}`);
  }
  const names = LEVELS.map((l) => l.name);
  assert.equal(new Set(names).size, names.length, "two maps share a name");
  for (const [ri] of REGIONS.entries()) {
    assert.equal(LEVELS.filter((l) => l.region === ri).length, 5,
      `region ${ri} should have five maps`);
  }
});

// The siege has no author to check it: wave N is generated. Walk far enough into
// it that the generator's roster and boss cycle are both exercised.
test("the siege generates legal waves for a long time", () => {
  for (let i = 0; i < 60; i++) {
    const groups = SIEGE.waveAt(i);
    assert.ok(groups.length > 0, `siege wave ${i}: empty`);
    for (const [id, n, gap] of groups) {
      assert.ok(ENEMY_BY_ID[id], `siege wave ${i}: unknown monster "${id}"`);
      assert.ok(n > 0 && gap > 0, `siege wave ${i}: bad ${id} group`);
    }
  }
});

/* ------------------------------- registries ------------------------------ */

test("tower stat tables all line up with their cost table", () => {
  const ids = new Set();
  for (const t of TOWERS) {
    assert.ok(!ids.has(t.id), `duplicate tower id ${t.id}`);
    ids.add(t.id);
    const n = t.costs.length;
    assert.equal(n, 3, `${t.id}: turrets should have three levels`);
    for (const key of ["dmg", "range", "rate", "splash", "slow", "slowFor", "chain"]) {
      if (!t[key]) continue;
      assert.equal(t[key].length, n, `${t.id}: ${key} has ${t[key].length} entries, costs has ${n}`);
    }
    for (let i = 1; i < n; i++) {
      assert.ok(t.dmg[i] > t.dmg[i - 1], `${t.id}: upgrading to level ${i + 1} must add damage`);
      assert.ok(t.costs[i] > t.costs[i - 1], `${t.id}: upgrades must cost more than the build`);
    }
  }
  assert.ok(TOWERS.some((t) => t.air), "nothing can shoot at flyers");
  assert.ok(TOWERS.some((t) => t.pierce), "nothing ignores armour");
});

test("every monster is buildable-against and pays out", () => {
  const ids = new Set();
  for (const e of ENEMIES) {
    assert.ok(!ids.has(e.id), `duplicate monster id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.hp > 0 && e.speed > 0 && e.gold > 0, `${e.id}: needs hp, speed and a gold value`);
    for (const child of e.splits || []) {
      assert.ok(ENEMY_BY_ID[child], `${e.id} splits into unknown "${child}"`);
      assert.notEqual(child, e.id, `${e.id} splits into itself — that never ends`);
    }
    if (e.spawns) assert.ok(ENEMY_BY_ID[e.spawns.id], `${e.id} spawns unknown "${e.spawns.id}"`);
  }
});

test("armoury upgrades are ordered and affordable in sequence", () => {
  for (const u of UPGRADES) {
    for (let i = 1; i < u.costs.length; i++) {
      assert.ok(u.costs[i] > u.costs[i - 1], `${u.id}: level ${i + 1} should cost more`);
    }
    const effects = ["gold", "lives", "power", "discount", "sandbags"].filter((k) => u[k]);
    assert.equal(effects.length, 1, `${u.id}: should do exactly one thing`);
    assert.equal(u[effects[0]].length, u.costs.length, `${u.id}: effect table doesn't match costs`);
  }
});
