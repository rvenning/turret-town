// Turret Town — the canvas: the map, the turrets, the monsters and all the
// pointer input. game.js knows nothing about any of this.
//
// Storybook look: flat saturated fills, every edge stroked in the same near-black
// ink, nothing softer than a rounded corner. No gradients on the pieces, so
// nothing here needs a compositing pass to look right.
//
// The board is a fixed COLS x ROWS grid of square cells scaled to fit whatever
// space is left above the build bar, and the grass is painted out to the real
// canvas edges past the board so the map never floats in a void.
//
// Selection is deliberately two-step: tapping a cell only SELECTS it, and the
// actual build is a big DOM button in the bar. That keeps the only small target
// on screen a harmless one.

const Render = {
  cv: null, ctx: null, stage: null,
  W: 0, H: 0, cell: 34, ox: 0, oy: 0, barH: 0, scale: 1,
  sel: null,              // { x, y } — the selected cell, tower or empty
  ghost: null,            // tower id being previewed from the build bar
  t: 0,

  boot() {
    this.cv = document.getElementById("cv");
    this.ctx = this.cv.getContext("2d");
    this.stage = document.getElementById("stage");

    const remeasure = () => { this.resize(); setTimeout(() => this.resize(), 350); };
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", remeasure);
      window.visualViewport.addEventListener("scroll", () => this.resize());
    }
    // iOS ignores user-scalable=no for pinch, so block it at the source — a
    // zoomed-in board can only be undone by closing the tab.
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("gesturechange", (e) => e.preventDefault());
    remeasure();

    const pos = (e) => {
      const r = this.cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.cv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const p = pos(e);
      this.tap(p.x, p.y);
    });
  },

  /* ------------------------------- layout ------------------------------- */

  resize() {
    if (!this.stage) return;
    const box = this.stage.getBoundingClientRect();
    // The game screen is display:none until it is shown, and a resize then reads
    // 0x0 — keep the last good layout rather than dividing by nothing.
    if (box.width < 50 || box.height < 50) return;

    this.W = box.width; this.H = box.height;
    const dpr = window.devicePixelRatio || 1;
    // Backing store ONLY. The canvas takes its display size from width/height
    // 100% in the stylesheet, which is what stops a retina canvas rendering
    // dpr-times too large; an inline pixel size here goes stale on the next
    // reflow and the canvas then hangs below the stage.
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bar = document.getElementById("buildbar");
    this.barH = bar ? bar.getBoundingClientRect().height : 100;
    const boardH = Math.max(80, this.H - this.barH);

    const cols = (typeof COLS !== "undefined") ? COLS : 10;
    const rows = (typeof ROWS !== "undefined") ? ROWS : 14;
    this.cell = Math.min(this.W / cols, boardH / rows);
    this.ox = (this.W - this.cell * cols) / 2;
    this.oy = (boardH - this.cell * rows) / 2;
    this.scale = this.cell / 34;
  },

  gx(cx) { return this.ox + cx * this.cell; },   // cell coords (floats) -> px
  gy(cy) { return this.oy + cy * this.cell; },

  cellAt(px, py) {
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    return { x, y };
  },

  /* -------------------------------- input ------------------------------- */

  tap(px, py) {
    if (!Game.running) return;
    const c = this.cellAt(px, py);
    if (!Game.inBounds(c.x, c.y)) { this.select(null); return; }
    const kind = Game.cellKind(c.x, c.y);
    if (kind === "road" || kind === "rock") { this.select(null); return; }
    this.select(c);
  },

  select(c) {
    this.sel = c;
    this.ghost = null;
    GK.Sfx.click && GK.Sfx.click();
    App.onSelect();
  },

  selectedTower() { return this.sel ? Game.towerAt(this.sel.x, this.sel.y) : null; },

  /* -------------------------------- frame ------------------------------- */

  update(dt) { this.t += dt; },

  render() {
    const ctx = this.ctx;
    if (!ctx || !this.W) return;
    const cell = this.cell;

    this.drawGround(ctx);
    this.drawRoad(ctx);
    this.drawRocks(ctx);
    if (this.sel && !this.selectedTower()) this.drawBuildHint(ctx);
    this.drawAirLane(ctx);
    this.drawGate(ctx);

    const [shx, shy] = Fx.shakeOffset();       // a TUPLE, not an object
    ctx.save();
    ctx.translate(shx, shy);

    for (const t of Game.towers) this.drawTower(ctx, t);
    this.drawRange(ctx);
    for (const e of Game.enemies) this.drawEnemy(ctx, e, cell);
    for (const s of Game.shots) this.drawShot(ctx, s);
    for (const f of Game.effects) this.drawEffect(ctx, f);

    Fx.render(ctx);
    ctx.restore();

    if (Fx.flash > 0) {
      ctx.globalAlpha = Math.min(1, Fx.flash);
      ctx.fillStyle = Fx.flashColor;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
  },

  /* ------------------------------ the world ----------------------------- */

  drawGround(ctx) {
    const region = REGIONS[(Game.level && Game.level.region) || 0] || REGIONS[0];
    const base = ["#6ea83f", "#a8703f", "#8fb6c9"][(Game.level && Game.level.region) || 0];
    const alt = ["#79b446", "#b57b46", "#9cc2d4"][(Game.level && Game.level.region) || 0];
    const out = ["#5c8f34", "#8f6136", "#7ba2b5"][(Game.level && Game.level.region) || 0];

    // Paint past the board on every side, so a tall phone shows more countryside
    // instead of two empty bands.
    ctx.fillStyle = out;
    ctx.fillRect(0, 0, this.W, this.H);

    const cell = this.cell;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        // hash2 returns a FLOAT 0-1 — scale it before the modulo or every tile
        // comes out the same.
        const h = Math.floor(GK.util.hash2(x, y) * 997);
        ctx.fillStyle = (h % 5 === 0) ? alt : base;
        ctx.fillRect(this.gx(x), this.gy(y), cell + 0.5, cell + 0.5);
        if (h % 7 === 3) {
          ctx.fillStyle = "rgba(0,0,0,0.06)";
          ctx.fillRect(this.gx(x) + cell * 0.2, this.gy(y) + cell * 0.55, cell * 0.24, cell * 0.1);
        }
      }
    }
    ctx.strokeStyle = "rgba(34,32,30,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.gx(0), this.gy(0), cell * COLS, cell * ROWS);
    this.regionIcon = region.icon;
  },

  drawRoad(ctx) {
    const pts = Game.route.pts;
    const w = this.cell * 0.78;
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    ctx.strokeStyle = "#8a6540"; ctx.lineWidth = w + 5;
    this.strokePath(ctx, pts);
    ctx.strokeStyle = "#c9a06a"; ctx.lineWidth = w;
    this.strokePath(ctx, pts);

    // Cobbles: short dashes across the road, stable because they come from the
    // distance along the route rather than from the frame.
    ctx.strokeStyle = "rgba(138,101,64,0.45)";
    ctx.lineWidth = Math.max(1.5, this.cell * 0.06);
    for (let d = 0.5; d < Game.route.len; d += 0.5) {
      const p = routeAt(Game.route, d);
      const q = routeAt(Game.route, Math.min(Game.route.len, d + 0.01));
      const a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
      const r = w * 0.42 / this.cell;
      ctx.beginPath();
      ctx.moveTo(this.gx(p.x + Math.cos(a) * r), this.gy(p.y + Math.sin(a) * r));
      ctx.lineTo(this.gx(p.x - Math.cos(a) * r), this.gy(p.y - Math.sin(a) * r));
      ctx.stroke();
    }
  },

  strokePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(this.gx(pts[0].x), this.gy(pts[0].y));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(this.gx(pts[i].x), this.gy(pts[i].y));
    ctx.stroke();
  },

  drawRocks(ctx) {
    const cell = this.cell;
    for (const key of Game.rocks) {
      const [x, y] = key.split(",").map(Number);
      const cx = this.gx(x + 0.5), cy = this.gy(y + 0.5);
      const r = cell * 0.34;
      ctx.fillStyle = "#3f3a35";
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.55, r * 1.05, r * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#8a8f96";
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      ctx.fillStyle = "#b3b8bf";
      ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.45, 0, 7); ctx.fill();
      ctx.strokeStyle = "#22201e"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    }
  },

  // A faint dotted line along the flyers' shortcut. It is the only way to see
  // WHY air defence is a different problem before the first Flitter arrives.
  drawAirLane(ctx) {
    const a = Game.airRoute.pts[0], b = Game.airRoute.pts[1];
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.gx(a.x), this.gy(a.y));
    ctx.lineTo(this.gx(b.x), this.gy(b.y));
    ctx.stroke();
    ctx.restore();
  },

  // The cave the monsters come out of, and the town they are walking at.
  drawGate(ctx) {
    const cell = this.cell;
    const s = Game.route.pts[0], e = Game.route.pts[Game.route.pts.length - 1];

    ctx.fillStyle = "#2c2622";
    ctx.beginPath();
    ctx.ellipse(this.gx(s.x), this.gy(s.y), cell * 0.42, cell * 0.34, 0, 0, 7);
    ctx.fill();

    const tx = this.gx(e.x), ty = this.gy(e.y);
    const w = cell * 0.92, h = cell * 0.8;
    ctx.fillStyle = "#e8d8b0";
    ctx.fillRect(tx - w / 2, ty - h / 2, w, h);
    ctx.fillStyle = "#4a7fc9";
    ctx.beginPath();
    ctx.moveTo(tx - w * 0.6, ty - h / 2);
    ctx.lineTo(tx, ty - h);
    ctx.lineTo(tx + w * 0.6, ty - h / 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8a6540";
    ctx.fillRect(tx - w * 0.18, ty - h * 0.1, w * 0.36, h * 0.6);
    ctx.strokeStyle = "#22201e"; ctx.lineWidth = 2;
    ctx.strokeRect(tx - w / 2, ty - h / 2, w, h);
  },

  // Bright dots on every square you could build on. A wash of colour over grass
  // is invisible; a shape is not.
  drawBuildHint(ctx) {
    const cell = this.cell;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (Game.cellKind(x, y) !== "grass") continue;
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.beginPath();
        ctx.arc(this.gx(x + 0.5), this.gy(y + 0.5), cell * 0.09, 0, 7);
        ctx.fill();
      }
    }
    const { x, y } = this.sel;
    ctx.strokeStyle = "#ffd63d"; ctx.lineWidth = 3;
    ctx.strokeRect(this.gx(x) + 1.5, this.gy(y) + 1.5, cell - 3, cell - 3);
  },

  // The range ring for whatever is selected, or for the turret being previewed
  // from the build bar — so you can see the reach BEFORE you spend the gold.
  drawRange(ctx) {
    if (!this.sel) return;
    const t = this.selectedTower();
    let range = null, cx, cy;
    if (t) {
      range = towerStat(t.def, t.level, "range", Game.loadout);
      cx = t.cx; cy = t.cy;
    } else if (this.ghost && TOWER_BY_ID[this.ghost]) {
      range = TOWER_BY_ID[this.ghost].range[0];
      cx = this.sel.x + 0.5; cy = this.sel.y + 0.5;
    }
    if (range === null) return;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.gx(cx), this.gy(cy), range * this.cell, 0, 7);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },

  /* ------------------------------- turrets ------------------------------ */

  drawTower(ctx, t) {
    const cell = this.cell;
    const cx = this.gx(t.cx), cy = this.gy(t.cy);
    const r = cell * 0.36;

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.7, r * 1.05, r * 0.42, 0, 0, 7); ctx.fill();

    // Base
    ctx.fillStyle = t.def.body;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#22201e"; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();

    // Barrel, pointed at whatever it last shot at
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t.aim);
    ctx.fillStyle = t.def.trim;
    const bl = r * (t.def.kind === "beam" ? 1.5 : 1.15);
    ctx.fillRect(0, -r * 0.2, bl, r * 0.4);
    ctx.strokeStyle = "#22201e"; ctx.lineWidth = 2;
    ctx.strokeRect(0, -r * 0.2, bl, r * 0.4);
    ctx.restore();

    // Hub
    ctx.fillStyle = t.def.trim;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, 7); ctx.fill();
    ctx.strokeStyle = "#22201e"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, 7); ctx.stroke();

    // Level pips along the top edge
    for (let i = 0; i <= t.level; i++) {
      ctx.fillStyle = "#ffd63d";
      ctx.beginPath();
      ctx.arc(cx - r * 0.5 + i * r * 0.5, cy - r * 0.95, Math.max(1.6, cell * 0.055), 0, 7);
      ctx.fill();
      ctx.strokeStyle = "#22201e"; ctx.lineWidth = 1.2; ctx.stroke();
    }

    if (this.sel && this.sel.x === t.x && this.sel.y === t.y) {
      ctx.strokeStyle = "#ffd63d"; ctx.lineWidth = 3;
      ctx.strokeRect(this.gx(t.x) + 1.5, this.gy(t.y) + 1.5, cell - 3, cell - 3);
    }
  },

  /* ------------------------------- monsters ----------------------------- */

  drawEnemy(ctx, e, cell) {
    const cx = this.gx(e.x), cy = this.gy(e.y);
    const big = e.def.boss ? 0.62 : 0.3;
    const r = cell * big;
    // A gentle bob keyed to the monster's own id, so a column of them doesn't
    // pulse in lockstep.
    const bob = Math.sin(this.t * 6 + e.uid) * cell * 0.05;

    if (e.def.flying) {
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.5, r * 0.8, r * 0.3, 0, 0, 7); ctx.fill();
    }

    ctx.save();
    ctx.translate(cx, cy + (e.def.flying ? bob - cell * 0.12 : bob * 0.4));

    if (e.def.flying) {   // wings
      ctx.fillStyle = e.def.shell;
      const flap = Math.sin(this.t * 14 + e.uid) * r * 0.35;
      ctx.beginPath();
      ctx.ellipse(-r * 1.1, flap, r * 0.7, r * 0.32, -0.4, 0, 7); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(r * 1.1, flap, r * 0.7, r * 0.32, 0.4, 0, 7); ctx.fill();
    }

    ctx.fillStyle = e.def.body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = e.def.shell;
    ctx.beginPath(); ctx.arc(0, -r * 0.25, r * 0.62, 0, 7); ctx.fill();
    ctx.strokeStyle = "#22201e"; ctx.lineWidth = e.def.boss ? 3 : 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();

    // Eyes — two dots is all it takes to make something read as alive.
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.15, r * 0.24, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.15, r * 0.24, 0, 7); ctx.fill();
    ctx.fillStyle = "#22201e";
    ctx.beginPath(); ctx.arc(-r * 0.26, -r * 0.13, r * 0.11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.34, -r * 0.13, r * 0.11, 0, 7); ctx.fill();

    if ((e.def.armour || 0) > 0) {   // a plate, so armour is visible not hidden
      ctx.fillStyle = "#c7ccd4";
      ctx.fillRect(-r * 0.55, r * 0.18, r * 1.1, r * 0.34);
      ctx.strokeStyle = "#22201e"; ctx.lineWidth = 1.6;
      ctx.strokeRect(-r * 0.55, r * 0.18, r * 1.1, r * 0.34);
    }

    if (e.slowT > 0) {              // chilled: a frosty wash and a snowflake
      ctx.fillStyle = "rgba(180,235,255,0.45)";
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    }
    ctx.restore();

    // Health bar, only once something has hurt it.
    if (e.hp < e.maxHp) {
      const w = r * 2, h = Math.max(3, cell * 0.09);
      const x = cx - w / 2, y = cy - r * (e.def.flying ? 2.1 : 1.5);
      ctx.fillStyle = "#22201e";
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = e.hp / e.maxHp > 0.5 ? "#5ec26a" : e.hp / e.maxHp > 0.25 ? "#ffd63d" : "#e8467c";
      ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), h);
    }
  },

  /* ------------------------------ projectiles --------------------------- */

  drawShot(ctx, s) {
    const cell = this.cell;
    const x = this.gx(s.x), y = this.gy(s.y);
    if (s.kind === "bomb") {
      ctx.fillStyle = "#3f3a35";
      ctx.beginPath(); ctx.arc(x, y, cell * 0.14, 0, 7); ctx.fill();
      ctx.fillStyle = "#ff8a3d";
      ctx.beginPath(); ctx.arc(x + Math.cos(this.t * 30) * 2, y - cell * 0.16, cell * 0.05, 0, 7); ctx.fill();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.ang || 0);
      ctx.strokeStyle = "#f5e6c8"; ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.beginPath(); ctx.moveTo(-cell * 0.22, 0); ctx.lineTo(cell * 0.12, 0); ctx.stroke();
      ctx.fillStyle = "#22201e";
      ctx.beginPath();
      ctx.moveTo(cell * 0.18, 0); ctx.lineTo(cell * 0.06, -cell * 0.07); ctx.lineTo(cell * 0.06, cell * 0.07);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  },

  drawEffect(ctx, f) {
    const cell = this.cell;
    const a = Math.max(0, Math.min(1, f.life * 5));
    ctx.save();
    ctx.globalAlpha = a;
    if (f.kind === "beam") {
      ctx.strokeStyle = "#ffd63d"; ctx.lineWidth = Math.max(2, cell * 0.09);
      ctx.beginPath();
      ctx.moveTo(this.gx(f.x1), this.gy(f.y1));
      ctx.lineTo(this.gx(f.x2), this.gy(f.y2));
      ctx.stroke();
    } else if (f.kind === "chain") {
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.beginPath();
      f.pts.forEach((p, i) => {
        const px = this.gx(p.x), py = this.gy(p.y);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
    } else if (f.kind === "ring") {
      ctx.strokeStyle = "#d6f2ff"; ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.beginPath();
      ctx.arc(this.gx(f.x), this.gy(f.y), f.r * this.cell * (1.2 - a * 0.2), 0, 7);
      ctx.stroke();
    } else if (f.kind === "boom") {
      ctx.fillStyle = "#ff8a3d";
      ctx.beginPath();
      ctx.arc(this.gx(f.x), this.gy(f.y), f.r * this.cell * (1.4 - a * 0.5), 0, 7);
      ctx.fill();
    }
    ctx.restore();
  },
};
