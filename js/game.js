// Turret Town — the simulation.
//
// This file touches no DOM, no canvas and no audio, which is what lets
// tests/bot.test.js run the REAL engine headlessly. It also contains **no
// randomness at all**: monsters spawn on a fixed schedule, turrets pick targets
// by a deterministic rule, and damage is a number rather than a roll. So a
// changed clear time in the bot report is a genuine balance change and never a
// bad shuffle — the same trick Critter Clash uses.
//
// Everything is in GRID CELLS and SECONDS. Rendering scales that to pixels; the
// engine never knows how big the screen is.
//
// The clock is a FIXED 1/60 step with an accumulator. Turret bolts travel at up
// to 11 cells/s, so a variable 50ms frame at double speed would move one 1.1
// cells and let it skip straight through its target's hit radius.

const STEP = 1 / 60;
const MAX_STEPS = 8;              // a tab that was hidden must not simulate a minute
const HIT_RADIUS = 0.28;          // cells — how close a bolt gets before it lands

const SCORING = {
  killPoints: 5,                  // × the monster's gold value
  livePoints: 50,                 // × lives remaining at the end
  wavePoints: 25,                 // × waves cleared
  siegeWave: 100,
  siegeKill: 2,
  // Three stars means the town was never touched. Two means it held.
  twoStarFrac: 0.6,
};

/* ---------------------------------------------------------------------------
   Routes — a waypoint list becomes a polyline you can walk by distance.
   -------------------------------------------------------------------------*/

// These are gamekit's GK.Route now — the same polyline-by-distance machinery
// Rocket Rescue's caves use, extracted so both games share one tested copy.
// Waypoints are cell coordinates and a monster walks through cell CENTRES,
// which is what the 0.5 offset is for.
function makeRoute(waypoints) { return GK.Route.make(waypoints, { offset: 0.5 }); }
function routeAt(route, d) { return GK.Route.at(route, d); }

// Every whole cell the road passes through, as an "x,y" key set. Used for
// "can I build here?" and for painting the road.
function routeCells(waypoints) { return GK.Route.cells(waypoints); }

/* ---------------------------------------------------------------------------
   The game
   -------------------------------------------------------------------------*/

const Game = {
  on: {},                 // main.js fills this in; the engine only ever emits

  running: false,
  mode: "level",
  speed: 1,

  start(cfg) {
    const loadout = cfg.loadout || { gold: 0, lives: 0, power: 0, discount: 0, sandbags: 0 };
    const siege = cfg.mode === "siege";
    const level = siege ? SIEGE : LEVELS[cfg.levelIdx];

    this.mode = siege ? "siege" : "level";
    this.levelIdx = siege ? -1 : cfg.levelIdx;
    this.level = level;
    this.loadout = loadout;
    this.cols = COLS; this.rows = ROWS;

    this.route = makeRoute(level.path);
    // Flyers ignore the road entirely and cut straight from the entry point to
    // the town gate. That is the whole reason air defence is a separate problem.
    this.airRoute = makeRoute([level.path[0], level.path[level.path.length - 1]]);
    this.road = routeCells(level.path);
    this.rocks = new Set((level.rocks || []).map(([x, y]) => x + "," + y));

    this.towers = [];
    this.byCell = {};       // "x,y" -> tower
    this.enemies = [];
    this.shots = [];
    this.effects = [];      // instant hits the renderer wants to draw for a moment

    this.gold = level.gold + loadout.gold;
    this.startLives = level.lives + loadout.lives;
    this.lives = this.startLives;
    this.sandbags = loadout.sandbags || 0;
    this.sandbagsUsed = 0;

    this.t = 0;
    this.acc = 0;
    this.speed = 1;
    this.waveIdx = -1;
    this.wavesCleared = 0;
    this.kills = 0;
    this.leaks = 0;
    this.score = 0;
    this.spawns = [];
    this.spawning = false;
    this.breather = 14;     // room to build before anything arrives
    this.uid = 1;
    this.running = true;
    this.over = null;

    this.emit("start", { level, mode: this.mode });
  },

  totalWaves() { return this.mode === "siege" ? Infinity : this.level.waves.length; },

  emit(name, data) { const f = this.on[name]; if (f) f(data); },

  abandon() { this.running = false; },

  /* ------------------------------- building ----------------------------- */

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; },

  cellKind(x, y) {
    if (!this.inBounds(x, y)) return "off";
    const k = x + "," + y;
    if (this.road.has(k)) return "road";
    if (this.rocks.has(k)) return "rock";
    if (this.byCell[k]) return "tower";
    return "grass";
  },

  towerAt(x, y) { return this.byCell[x + "," + y] || null; },

  buildCost(id) {
    const def = TOWER_BY_ID[id];
    return def ? towerCost(def, 0, this.loadout) : null;
  },

  canBuild(x, y, id) {
    if (!this.running) return false;
    if (this.cellKind(x, y) !== "grass") return false;
    return this.gold >= this.buildCost(id);
  },

  build(x, y, id) {
    if (!this.canBuild(x, y, id)) return null;
    const def = TOWER_BY_ID[id];
    const cost = towerCost(def, 0, this.loadout);
    this.gold -= cost;
    const t = {
      uid: this.uid++, def, id, level: 0,
      x, y, cx: x + 0.5, cy: y + 0.5,
      cool: 0, aim: -Math.PI / 2, prio: "first", shotsFired: 0, damageDone: 0,
    };
    this.towers.push(t);
    this.byCell[x + "," + y] = t;
    this.emit("build", { tower: t, cost });
    return t;
  },

  upgradeCost(t) { return towerCost(t.def, t.level + 1, this.loadout); },

  upgrade(x, y) {
    const t = this.towerAt(x, y);
    if (!t || t.level >= t.def.costs.length - 1) return false;
    const cost = this.upgradeCost(t);
    if (this.gold < cost) return false;
    this.gold -= cost;
    t.level++;
    this.emit("upgrade", { tower: t, cost });
    return true;
  },

  sell(x, y) {
    const t = this.towerAt(x, y);
    if (!t) return false;
    const back = towerRefund(t.def, t.level + 1, this.loadout);
    this.gold += back;
    this.towers.splice(this.towers.indexOf(t), 1);
    delete this.byCell[x + "," + y];
    this.emit("sell", { tower: t, gold: back });
    return true;
  },

  // First / Strongest / Closest. Placement is most of the game, but letting a
  // Watchtower ignore the trash and hold for the Brute is a real decision.
  cyclePriority(x, y) {
    const t = this.towerAt(x, y);
    if (!t) return null;
    const order = ["first", "strong", "close"];
    t.prio = order[(order.indexOf(t.prio) + 1) % order.length];
    return t.prio;
  },

  /* -------------------------------- waves ------------------------------- */

  waveGroups(i) {
    return this.mode === "siege" ? SIEGE.waveAt(i) : this.level.waves[i];
  },

  hpMulFor(i) {
    if (this.mode === "siege") return Math.pow(SIEGE.hpGrowth, i);
    return this.level.hpMul || 1;
  },

  startWave() {
    this.waveIdx++;
    const groups = this.waveGroups(this.waveIdx);
    this.spawns = [];
    for (const [id, n, gap, at] of groups) {
      for (let k = 0; k < n; k++) {
        this.spawns.push({ t: this.t + (at || 0) + k * gap, id });
      }
    }
    this.spawns.sort((a, b) => a.t - b.t);
    this.spawning = true;
    this.breather = 0;
    this.emit("wave", { index: this.waveIdx, total: this.totalWaves(), groups });
  },

  // Rushing the next wave pays for the seconds you gave up. It is the main lever
  // a confident player has on the economy.
  sendWave() {
    if (!this.running || this.spawning || this.breather <= 0) return 0;
    const bonus = Math.max(0, Math.round(this.breather * RUSH_GOLD_PER_SEC));
    this.gold += bonus;
    this.startWave();
    this.emit("rush", { bonus });
    return bonus;
  },

  spawn(id, d, hpScale) {
    const def = ENEMY_BY_ID[id];
    if (!def) return null;
    const hp = Math.round(def.hp * this.hpMulFor(this.waveIdx) * (hpScale || 1));
    const route = def.flying ? this.airRoute : this.route;
    const e = {
      uid: this.uid++, def, id, hp, maxHp: hp,
      d: d || 0, route, routeLen: route.len,
      speed: def.speed, slowT: 0, slowMul: 1,
      x: 0, y: 0, dead: false, spawnCool: def.spawns ? def.spawns.every : 0,
    };
    const p = routeAt(route, e.d);
    e.x = p.x; e.y = p.y;
    this.enemies.push(e);
    this.emit("spawn", { enemy: e });
    return e;
  },

  /* --------------------------------- loop ------------------------------- */

  // Called with REAL seconds. Speed and the fixed step are handled in here so
  // every caller — the frame loop and the bots — gets identical physics.
  tick(dtReal) {
    if (!this.running) return;
    this.acc += Math.min(0.25, dtReal) * this.speed;
    let steps = 0;
    while (this.acc >= STEP && steps++ < MAX_STEPS && this.running) {
      this.acc -= STEP;
      this.step(STEP);
    }
    if (steps >= MAX_STEPS) this.acc = 0;
  },

  step(dt) {
    this.t += dt;

    if (this.spawning) {
      while (this.spawns.length && this.spawns[0].t <= this.t) {
        this.spawn(this.spawns.shift().id, 0);
      }
    } else if (this.breather > 0) {
      this.breather -= dt;
      if (this.breather <= 0) this.startWave();
    }

    this.stepEnemies(dt);
    this.stepTowers(dt);
    this.stepShots(dt);

    for (let i = this.effects.length - 1; i >= 0; i--) {
      if ((this.effects[i].life -= dt) <= 0) this.effects.splice(i, 1);
    }

    // The end checks live HERE, on the path every driver passes through, rather
    // than inside the player-facing actions — a headless bot that never touches
    // the UI would otherwise clear a level that never ended.
    //
    // Losing is checked FIRST, and it matters: the last monster of the last wave
    // can walk into town and empty the life bar, which also empties the board —
    // and a wave-clear check that ran first would call that a win with zero
    // stars. The bots caught exactly that on the final map.
    if (this.lives <= 0) { this.finish(false); return; }
    if (this.spawning && !this.spawns.length && !this.enemies.length) this.waveCleared();
  },

  stepEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i, 1); continue; }

      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowMul = 1; }
      e.d += e.speed * e.slowMul * dt;

      const p = routeAt(e.route, e.d);
      e.x = p.x; e.y = p.y;

      if (e.def.spawns) {
        e.spawnCool -= dt;
        if (e.spawnCool <= 0) {
          e.spawnCool = e.def.spawns.every;
          for (let k = 0; k < e.def.spawns.n; k++) {
            this.spawn(e.def.spawns.id, Math.max(0, e.d - 0.4 - k * 0.3));
          }
        }
      }

      if (e.d >= e.routeLen) {
        this.enemies.splice(i, 1);
        this.leak(e);
      }
    }
  },

  leak(e) {
    this.leaks++;
    // Sandbags forgive a monster that has ALREADY got through — that is the only
    // moment anyone knows they needed them.
    if (this.sandbags > 0) {
      this.sandbags--;
      this.sandbagsUsed++;
      this.emit("leak", { enemy: e, sandbagged: true, lives: this.lives });
      return;
    }
    this.lives = Math.max(0, this.lives - (e.def.leak || 1));
    this.emit("leak", { enemy: e, sandbagged: false, lives: this.lives });
  },

  stepTowers(dt) {
    for (const t of this.towers) {
      if (t.cool > 0) t.cool -= dt;
      if (t.cool > 0) continue;
      const range = towerStat(t.def, t.level, "range", this.loadout);
      const target = this.pickTarget(t, range);
      if (!target) { t.cool = 0; continue; }
      t.aim = Math.atan2(target.y - t.cy, target.x - t.cx);
      this.fire(t, target, range);
      t.shotsFired++;
      t.cool = 1 / towerStat(t.def, t.level, "rate", this.loadout);
    }
  },

  pickTarget(t, range) {
    let best = null, bestKey = -Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.def.flying && !t.def.air) continue;
      const dx = e.x - t.cx, dy = e.y - t.cy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > range * range) continue;
      let key;
      if (t.prio === "strong") key = e.maxHp * 1000 + e.d;
      else if (t.prio === "close") key = -dist2;
      else key = e.d / e.routeLen;         // "first" — nearest to the town
      if (key > bestKey) { bestKey = key; best = e; }
    }
    return best;
  },

  fire(t, target, range) {
    const def = t.def;
    const dmg = towerStat(def, t.level, "dmg", this.loadout);

    if (def.kind === "bolt" || def.kind === "bomb") {
      this.shots.push({
        uid: this.uid++, tower: t, target, kind: def.kind,
        x: t.cx, y: t.cy, speed: def.shotSpeed, dmg,
        // Seeded now, not on the first move: another turret can kill this
        // target later in the same step, and a shot with no heading is a NaN.
        ang: Math.atan2(target.y - t.cy, target.x - t.cx),
        splash: def.kind === "bomb" ? towerStat(def, t.level, "splash", this.loadout) : 0,
        pierce: !!def.pierce,
      });
      this.emit("fire", { tower: t, target, kind: def.kind });
      return;
    }

    if (def.kind === "beam") {
      this.hit(t, target, dmg, !!def.pierce);
      this.effects.push({ kind: "beam", x1: t.cx, y1: t.cy, x2: target.x, y2: target.y, life: 0.12 });
      this.emit("fire", { tower: t, target, kind: "beam" });
      return;
    }

    if (def.kind === "pulse") {
      const slow = towerStat(def, t.level, "slow", this.loadout);
      const dur = towerStat(def, t.level, "slowFor", this.loadout);
      const touched = [];
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - t.cx, e.y - t.cy) > range) continue;
        touched.push(e);
        // `chill: false` monsters feel the damage but not the cold.
        if (e.def.chill !== false) {
          const mul = 1 - slow;
          if (mul < e.slowMul || e.slowT <= 0) e.slowMul = mul;
          e.slowT = Math.max(e.slowT, dur);
        }
        this.hit(t, e, dmg, false);
      }
      this.effects.push({ kind: "ring", x: t.cx, y: t.cy, r: range, life: 0.35 });
      this.emit("fire", { tower: t, target, kind: "pulse", n: touched.length });
      return;
    }

    if (def.kind === "chain") {
      const hops = towerStat(def, t.level, "chain", this.loadout);
      const seen = new Set();
      const pts = [{ x: t.cx, y: t.cy }];
      let cur = target, power = dmg;
      for (let i = 0; i < hops && cur; i++) {
        seen.add(cur.uid);
        pts.push({ x: cur.x, y: cur.y });
        this.hit(t, cur, power, false);
        power *= def.chainFall;
        let next = null, bestD = def.chainHop;
        for (const e of this.enemies) {
          if (e.dead || seen.has(e.uid)) continue;
          if (e.def.flying && !def.air) continue;
          const d = Math.hypot(e.x - cur.x, e.y - cur.y);
          if (d < bestD) { bestD = d; next = e; }
        }
        cur = next;
      }
      this.effects.push({ kind: "chain", pts, life: 0.14 });
      this.emit("fire", { tower: t, target, kind: "chain", hops: pts.length - 1 });
    }
  },

  stepShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      // A bolt whose target died mid-flight keeps going to where it was aimed
      // and fizzles; it does NOT re-home, or a single archer would never miss.
      const tx = s.target.dead ? s.x + Math.cos(s.ang || 0) : s.target.x;
      const ty = s.target.dead ? s.y + Math.sin(s.ang || 0) : s.target.y;
      const dx = tx - s.x, dy = ty - s.y;
      const dist = Math.hypot(dx, dy) || 1;
      s.ang = Math.atan2(dy, dx);
      const move = s.speed * dt;

      if (s.target.dead) {
        s.x += (dx / dist) * move; s.y += (dy / dist) * move;
        if ((s.fizz = (s.fizz || 0) + dt) > 0.3) this.shots.splice(i, 1);
        continue;
      }

      if (dist <= move + HIT_RADIUS) {
        s.x = tx; s.y = ty;
        this.shots.splice(i, 1);
        if (s.splash) {
          for (const e of this.enemies) {
            if (e.dead || e.def.flying) continue;
            if (Math.hypot(e.x - s.x, e.y - s.y) <= s.splash) this.hit(s.tower, e, s.dmg, s.pierce);
          }
          this.effects.push({ kind: "boom", x: s.x, y: s.y, r: s.splash, life: 0.28 });
          this.emit("boom", { x: s.x, y: s.y, r: s.splash });
        } else {
          this.hit(s.tower, s.target, s.dmg, s.pierce);
        }
        continue;
      }
      s.x += (dx / dist) * move;
      s.y += (dy / dist) * move;
    }
  },

  hit(tower, e, raw, pierce) {
    if (e.dead) return;
    const dmg = damageAfterArmour(raw, e.def, pierce);
    e.hp -= dmg;
    if (tower) tower.damageDone += dmg;
    this.emit("hit", { enemy: e, dmg, x: e.x, y: e.y });
    if (e.hp <= 0) this.kill(e);
  },

  kill(e) {
    e.dead = true;
    this.kills++;
    this.gold += e.def.gold;
    this.score += e.def.gold * SCORING.killPoints;
    this.emit("kill", { enemy: e, gold: e.def.gold, x: e.x, y: e.y });

    // Splitters push the problem further down the road rather than ending it.
    for (const id of e.def.splits || []) {
      this.spawn(id, Math.max(0, e.d - 0.25));
    }
  },

  waveCleared() {
    this.spawning = false;
    this.wavesCleared++;
    const pay = WAVE_GOLD(this.waveIdx);
    this.gold += pay;
    this.score += SCORING.wavePoints;
    this.emit("waveEnd", { index: this.waveIdx, gold: pay });

    if (this.mode === "level" && this.waveIdx >= this.level.waves.length - 1) {
      this.finish(true);
      return;
    }
    this.breather = BREATHER;
  },

  stars() {
    if (this.lives <= 0) return 0;
    if (this.lives >= this.startLives) return 3;
    if (this.lives >= Math.ceil(this.startLives * SCORING.twoStarFrac)) return 2;
    return 1;
  },

  finish(win) {
    if (!this.running) return;
    this.running = false;
    if (this.lives <= 0) win = false;         // belt and braces: no zero-star wins
    const siege = this.mode === "siege";
    const score = siege
      ? this.wavesCleared * SCORING.siegeWave + this.kills * SCORING.siegeKill
      : this.score + (win ? this.lives * SCORING.livePoints : 0);

    this.over = {
      mode: this.mode,
      levelIdx: this.levelIdx,
      win: siege ? false : win,
      stars: siege ? 0 : (win ? this.stars() : 0),
      score,
      lives: this.lives,
      startLives: this.startLives,
      leaks: this.leaks,
      kills: this.kills,
      wavesCleared: this.wavesCleared,
      totalWaves: siege ? this.wavesCleared : this.level.waves.length,
      sandbagsUsed: this.sandbagsUsed,
      goldLeft: this.gold,
      time: this.t,
    };
    this.emit("end", this.over);
  },
};

if (typeof module !== "undefined") {
  module.exports = { Game, SCORING, STEP, makeRoute, routeAt, routeCells };
}
