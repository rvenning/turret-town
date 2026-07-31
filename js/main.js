// Turret Town — screens, storage wiring, the build bar and the frame loop.
//
// Everything that touches the DOM lives here. game.js decides what is true and
// emits events; this file animates them, plays them and writes them down.

const App = {
  profile: null,
  progress: null,
  loadout: null,
  active: false,          // is the game screen the one showing?
  paused: false,
  lastTs: 0,
  _hud: "",
  _banked: 0,

  init() {
    Render.boot();
    this.wireGame();

    GK.UI.onScreenChange = (name) => {
      this.active = name === "game";
      if (name === "game") Render.resize();
      if (name === "splash") this.refreshSplash();
      if (name !== "game") Music.stop();
    };

    GK.Profiles.init({
      storage: Storage,
      avatars: ["🏰", "🐉", "🦊", "🦉", "🐺", "🦄", "🐲", "🤖", "👑", "🧙", "🐈", "🦁"],
      meta: (p, prog) => `⭐ ${Storage.totalStars(prog)}/${LEVELS.length * 3} · 🪙 ${Storage.coins(prog)}`,
      onEnter: (p) => this.enter(p),
      addLabel: "New Commander",
    });

    GK.initPWA({ appName: "Turret Town" });
    GK.UI.bindSoundToggle(Storage);

    const settings = Storage.getSettings();
    Music.enabled = settings.music !== false;
    this.paintMusicButtons();

    Storage.initFirebase().then((live) => {
      const badge = document.getElementById("sync-badge");
      if (badge) badge.textContent = live ? "☁️ synced with the family" : "📴 this device only";
    });

    this.refreshSplash();

    GK.Debug.init({ storage: Storage, title: "TURRET TOWN" })
      .jump("map", LEVELS.length, (n) => this.startLevel(n - 1))
      .action("+500 gold", () => { Game.gold += 500; })
      .action("skip breather", () => Game.sendWave())
      .action("the siege", () => this.startSiege());

    requestAnimationFrame((ts) => this.frame(ts));
  },

  /* ---------------------------- splash & profiles ---------------------- */

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const btn = document.getElementById("btn-continue-as");
    if (!btn) return;
    if (last) {
      btn.style.display = "";
      btn.innerHTML = `${last.avatar} Back to the walls, ${GK.util.esc(last.name)}`;
      btn.onclick = () => GK.Profiles.select(last);
    } else {
      btn.style.display = "none";
    }
  },

  play() { GK.Profiles.renderList(); GK.UI.showScreen("profiles"); },

  enter(profile) {
    this.profile = profile;
    this.progress = Storage.getProgress(profile.id);
    this.loadout = upgradeLoadout(this.progress);
    GK.Sfx.init();
    this.showMap();
  },

  /* -------------------------------- the map ---------------------------- */

  showMap() {
    this.progress = Storage.getProgress(this.profile.id);
    this.loadout = upgradeLoadout(this.progress);
    const unlocked = Storage.unlockedLevel(this.progress);

    document.getElementById("map-player").innerHTML =
      `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>` +
      `<span class="map-stats">⭐ ${Storage.totalStars(this.progress)} · 🪙 ${Storage.coins(this.progress)}</span>`;

    const cont = document.getElementById("btn-continue");
    cont.innerHTML = `▶️ ${unlocked + 1}. ${GK.util.esc(LEVELS[unlocked].name)}`;
    cont.onclick = () => this.startLevel(unlocked);

    const siege = document.getElementById("btn-siege");
    const open = Storage.siegeUnlocked(this.progress);
    siege.disabled = !open;
    siege.innerHTML = open
      ? `🛡️ The Long Siege${this.progress.siegeScore ? ` — best ${this.progress.siegeScore}` : ""}`
      : `🔒 The Long Siege (clear ${SIEGE_UNLOCK_LEVELS} maps)`;

    document.getElementById("level-list").innerHTML = REGIONS.map((region, ri) => {
      const rows = LEVELS.map((l, i) => [l, i]).filter(([l]) => l.region === ri);
      const done = rows.every(([, i]) => this.progress.levels[i]);
      return `<section class="region${done ? " done" : ""}" style="--region:${region.hue}">
        <header class="region-head"><span class="region-icon">${region.icon}</span>
          <h3>${region.name}</h3>${done ? '<span class="region-tick">✔</span>' : ""}</header>
        <div class="level-row">${rows.map(([l, i]) => this.levelCard(l, i, unlocked)).join("")}</div>
      </section>`;
    }).join("");

    GK.UI.showScreen("map");
  },

  levelCard(l, i, unlocked) {
    const rec = (this.progress.levels || {})[i];
    const locked = i > unlocked;
    const stars = rec ? rec.stars : 0;
    const pips = locked ? "🔒" : "★★★".slice(0, stars).padEnd(3, "☆");
    return `<button class="level-card${locked ? " locked" : ""}${i === unlocked ? " next" : ""}"
      ${locked ? "disabled" : ""} onclick="App.startLevel(${i})">
      <span class="lc-num">${i + 1}${l.boss ? " 👑" : ""}</span>
      <span class="lc-name">${GK.util.esc(l.name)}</span>
      <span class="lc-stars">${pips}</span></button>`;
  },

  /* ------------------------------ running a map ------------------------ */

  startLevel(idx) { this.beginRun({ mode: "level", levelIdx: idx, loadout: this.loadout }); },

  startSiege() {
    if (!Storage.siegeUnlocked(this.progress)) return;
    this.beginRun({ mode: "siege", loadout: this.loadout });
  },

  beginRun(cfg) {
    GK.Sfx.init();
    this.paused = false;
    Fx.reset();
    Render.sel = null;
    Render.ghost = null;
    Game.start(cfg);

    GK.UI.showScreen("game");
    // The build bar and HUD size the stage, so fill them BEFORE measuring —
    // measuring first gives a layout that is already out of date.
    this.onSelect();
    this.updateHud(true);
    Render.resize();

    Music.start(cfg.mode === "siege" ? 2 : LEVELS[cfg.levelIdx].region, false);
    GK.UI.toast(cfg.mode === "siege" ? "Hold out as long as you can!" : Game.level.hint);
  },

  wireGame() {
    Game.on = {
      fire: (d) => GK.Sfx.shoot(d.kind),

      boom: (d) => {
        GK.Sfx.boom();
        Fx.burst(Render.gx(d.x), Render.gy(d.y), "#ff8a3d", 8, 130, 0.35, 2.4);
      },

      kill: (d) => {
        const px = Render.gx(d.x), py = Render.gy(d.y);
        if (d.enemy.def.boss) {
          GK.Sfx.bossDown();
          Fx.addShake(10);
          Fx.burst(px, py, d.enemy.def.body, 30, 200, 0.7, 4);
          Fx.text(px, py, `+${d.gold}`, { color: "#ffd63d", size: 20 });
        } else {
          GK.Sfx.splat();
          Fx.burst(px, py, d.enemy.def.body, 6, 110, 0.3, 2.2);
        }
      },

      leak: (d) => {
        if (d.sandbagged) {
          GK.Sfx.sandbag();
          GK.UI.toast("🛡️ Sandbags held! No lives lost.");
          return;
        }
        GK.Sfx.leak();
        Fx.addShake(7);
        Fx.flash = 0.45; Fx.flashColor = "#e8467c";
        if (d.enemy.def.boss) GK.UI.toast("The boss got through! 💔");
      },

      wave: (d) => {
        const boss = (d.groups || []).some(([id]) => (ENEMY_BY_ID[id] || {}).boss);
        if (boss) { GK.Sfx.bossHorn(); Music.goBoss(); GK.UI.toast("👑 A boss is coming!"); }
        else GK.Sfx.waveHorn();
        this.updateHud(true);
      },

      waveEnd: (d) => {
        GK.Sfx.waveClear();
        Fx.text(Render.W / 2, Render.H * 0.35, `Wave clear  +${d.gold}🪙`,
          { color: "#ffd63d", size: 18 });
      },

      rush: (d) => { GK.Sfx.rush(); Fx.text(Render.W / 2, Render.H * 0.4, `+${d.bonus}🪙`, { color: "#ffd63d" }); },

      build: () => { GK.Sfx.place(); this.onSelect(); },
      upgrade: () => { GK.Sfx.upgradeUp(); this.onSelect(); },
      sell: () => { GK.Sfx.scrap(); Render.sel = null; this.onSelect(); },

      end: (r) => this.finishRun(r),
    };
  },

  /* ------------------------------- build bar --------------------------- */

  // Three states in one fixed-height bar: nothing selected, an empty square
  // selected, or one of your turrets selected. The bar never changes height, so
  // it can't reflow the stage mid-wave and leave the board geometry stale.
  onSelect() {
    const idle = document.getElementById("bb-idle");
    const build = document.getElementById("bb-build");
    const panel = document.getElementById("bb-tower");
    const t = Render.selectedTower();

    idle.style.display = (!Render.sel) ? "" : "none";
    build.style.display = (Render.sel && !t) ? "" : "none";
    panel.style.display = t ? "" : "none";

    if (Render.sel && !t) {
      build.innerHTML = TOWERS.map((def) => {
        const cost = towerCost(def, 0, Game.loadout);
        const afford = Game.gold >= cost;
        return `<button class="turret-btn${afford ? "" : " poor"}"
          onclick="App.buildHere('${def.id}')" onpointerenter="App.preview('${def.id}')">
          <span class="tb-icon">${def.icon}</span>
          <span class="tb-name">${def.name}</span>
          <span class="tb-cost">🪙 ${cost}</span></button>`;
      }).join("");
    }

    if (t) {
      const lvl = t.level + 1, max = t.def.costs.length;
      const up = Game.upgradeCost(t);
      const dmg = Math.round(towerStat(t.def, t.level, "dmg", Game.loadout));
      const rng = towerStat(t.def, t.level, "range", Game.loadout).toFixed(1);
      const rate = towerStat(t.def, t.level, "rate", Game.loadout).toFixed(1);
      const prioLabel = { first: "🚩 First", strong: "💪 Strongest", close: "📍 Closest" }[t.prio];
      panel.innerHTML =
        `<div class="tp-info"><span class="tp-icon">${t.def.icon}</span>
           <span class="tp-text"><b>${t.def.name} ${"I".repeat(lvl)}</b>
           <span class="tp-stats">⚔️ ${dmg} · 📏 ${rng} · ⏱️ ${rate}/s${t.def.air ? "" : " · 🚫✈️"}</span></span></div>
         <div class="tp-acts">
           <button class="btn small ${up !== null && Game.gold >= up ? "green" : "grey"}"
             ${up === null || Game.gold < up ? "disabled" : ""} onclick="App.upgradeHere()">
             ${up === null ? `Max (${lvl}/${max})` : `⬆️ 🪙 ${up}`}</button>
           <button class="btn small blue" onclick="App.cyclePrio()">${prioLabel}</button>
           <button class="btn small grey" onclick="App.sellHere()">♻️ 🪙 ${towerRefund(t.def, t.level + 1, Game.loadout)}</button>
         </div>`;
    }
  },

  preview(id) { Render.ghost = id; },

  buildHere(id) {
    if (!Render.sel) return;
    const { x, y } = Render.sel;
    if (!Game.canBuild(x, y, id)) {
      GK.Sfx.denied();
      GK.UI.toast(Game.gold < Game.buildCost(id) ? "Not enough gold yet!" : "You can't build there.");
      return;
    }
    Game.build(x, y, id);
    Render.sel = { x, y };
  },

  upgradeHere() {
    if (!Render.sel) return;
    if (!Game.upgrade(Render.sel.x, Render.sel.y)) {
      GK.Sfx.denied();
      GK.UI.toast("Not enough gold yet!");
    }
  },

  sellHere() { if (Render.sel) Game.sell(Render.sel.x, Render.sel.y); },

  cyclePrio() {
    if (!Render.sel) return;
    Game.cyclePriority(Render.sel.x, Render.sel.y);
    GK.Sfx.click();
    this.onSelect();
  },

  /* --------------------------------- HUD ------------------------------- */

  sendWave() { if (Game.sendWave()) this.updateHud(true); },

  toggleSpeed() {
    Game.speed = Game.speed === 1 ? 2 : 1;
    GK.Sfx.click();
    this.updateHud(true);
  },

  updateHud(force) {
    if (!Game.level) return;
    const waveNo = Math.max(0, Game.waveIdx) + 1;
    const total = Game.mode === "siege" ? "∞" : Game.level.waves.length;
    const key = [Game.lives, Game.gold, waveNo, Game.spawning, Math.ceil(Game.breather), Game.speed].join("|");
    if (!force && key === this._hud) return;
    this._hud = key;

    document.getElementById("hud-lives").textContent = `❤️ ${Game.lives}`;
    document.getElementById("hud-gold").textContent = `🪙 ${Game.gold}`;
    document.getElementById("hud-wave").textContent = `🌊 ${waveNo}/${total}`;
    document.getElementById("btn-speed").textContent = Game.speed === 1 ? "▶ 1×" : "⏩ 2×";

    const next = document.getElementById("btn-next");
    if (!Game.spawning && Game.breather > 0) {
      const bonus = Math.round(Game.breather * RUSH_GOLD_PER_SEC);
      next.disabled = false;
      next.innerHTML = `▶▶ ${Math.ceil(Game.breather)}s <b>+${bonus}🪙</b>`;
    } else {
      next.disabled = true;
      next.innerHTML = "⚔️ Fighting";
    }
  },

  /* -------------------------------- pausing ---------------------------- */

  pause() { if (!Game.running) return; this.paused = true; GK.UI.openModal("modal-pause"); },
  resume() { this.paused = false; GK.UI.closeModal("modal-pause"); },
  quit() {
    this.paused = false;
    GK.UI.closeModal("modal-pause");
    Game.abandon();
    Music.stop();
    this.showMap();
  },
  showHelp() { GK.UI.closeModal("modal-pause"); GK.UI.openModal("modal-help"); },

  toggleMusic() {
    Music.toggle();
    this.paintMusicButtons();
    GK.Sfx.click();
  },

  paintMusicButtons() {
    for (const b of document.querySelectorAll(".btn-music")) b.textContent = Music.enabled ? "🎵" : "🔇";
  },

  /* -------------------------------- results ---------------------------- */

  finishRun(r) {
    Music.stop();
    const rec = Storage.recordRun(this.profile.id, r);
    this.progress = rec.progress;
    this.loadout = upgradeLoadout(this.progress);
    r.coins = rec.coins;
    setTimeout(() => this.showResults(r), 700);
  },

  showResults(r) {
    const siege = r.mode === "siege";
    const best = siege && r.score >= (this.progress.siegeScore || 0) && r.score > 0;

    document.getElementById("res-emoji").textContent =
      siege ? (best ? "🏆" : "🛡️") : (r.win ? ["😅", "🙂", "😄", "🥳"][r.stars] : "💔");
    document.getElementById("res-title").textContent = siege
      ? (best ? "A new family record!" : "The siege ends")
      : (r.win ? "The town holds!" : "The town has fallen");

    const starsEl = document.getElementById("res-stars");
    starsEl.innerHTML = "";
    starsEl.style.display = siege ? "none" : "";

    document.getElementById("res-score").textContent = "0";
    document.getElementById("res-waves").textContent = siege
      ? `🌊 ${r.wavesCleared} waves survived`
      : `🌊 ${r.wavesCleared} of ${r.totalWaves} waves`;
    document.getElementById("res-kills").textContent = `💀 ${r.kills} monsters stopped`;
    document.getElementById("res-lives").textContent = r.win || siege
      ? `❤️ ${r.lives} of ${r.startLives} lives left`
      : `💔 ${r.leaks} got through`;
    document.getElementById("res-coins").textContent = r.coins ? `🪙 +${r.coins} coins` : "";
    document.getElementById("res-sand").textContent =
      r.sandbagsUsed ? `🛡️ sandbags saved you ${r.sandbagsUsed}×` : "";

    const retry = document.getElementById("res-retry");
    const next = document.getElementById("res-next");
    const nextIdx = r.levelIdx + 1;
    if (siege) {
      retry.style.display = ""; retry.innerHTML = "🛡️ Again";
      retry.onclick = () => this.startSiege();
      next.style.display = "none";
    } else if (r.win && nextIdx < LEVELS.length) {
      retry.style.display = ""; retry.innerHTML = "🔁 Replay";
      retry.onclick = () => this.startLevel(r.levelIdx);
      next.style.display = ""; next.innerHTML = "▶️ Next map";
      next.onclick = () => this.startLevel(nextIdx);
    } else if (r.win) {
      retry.style.display = "none";
      next.style.display = ""; next.innerHTML = "🛡️ The Long Siege";
      next.onclick = () => this.startSiege();
    } else {
      retry.style.display = ""; retry.innerHTML = "🔁 Try again";
      retry.onclick = () => this.startLevel(r.levelIdx);
      next.style.display = "none";
    }

    document.getElementById("res-finished").style.display =
      (!siege && r.win && nextIdx >= LEVELS.length) ? "" : "none";

    GK.UI.showScreen("results");
    if (!siege && r.win) GK.Sfx.victory();
    else if (!siege) GK.Sfx.townFell();

    if (!siege) {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const s = document.createElement("span");
          s.className = "res-star" + (i < r.stars ? " on" : "");
          s.textContent = i < r.stars ? "★" : "☆";
          starsEl.appendChild(s);
          if (i < r.stars) GK.Sfx.star(i);
        }, 300 + i * 360);
      }
    }

    this.countUp(document.getElementById("res-score"), r.score, siege ? 200 : 1400);

    if (r.stars === 3 || best) {
      setTimeout(() => {
        Fx.confetti(window.innerWidth, window.innerHeight,
          ["#ffd63d", "#5ec26a", "#4aa3ff", "#e8467c", "#ff8a3d"], 90);
      }, 1400);
    }
  },

  // The animation supplies the punch; it must never be the only thing that can
  // deliver the number. A backgrounded tab never advances requestAnimationFrame,
  // and the score would sit frozen on whatever the first frame computed.
  countUp(el, target, delay) {
    const dur = 900;
    setTimeout(() => {
      const t0 = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      };
      step();
    }, delay);
    setTimeout(() => { el.textContent = target.toLocaleString(); }, delay + dur + 80);
  },

  /* ------------------------------ the armoury -------------------------- */

  showArmoury() {
    this.progress = Storage.getProgress(this.profile.id);
    document.getElementById("shop-coins").textContent = Storage.coins(this.progress);
    document.getElementById("shop-list").innerHTML = UPGRADES.map((u) => {
      const lvl = upgradeLevel(this.progress, u.id);
      const maxed = lvl >= u.costs.length;
      const cost = maxed ? 0 : u.costs[lvl];
      const afford = Storage.coins(this.progress) >= cost;
      const pips = u.costs.map((_, i) => (i < lvl ? "●" : "○")).join(" ");
      return `<div class="shop-item">
        <span class="si-icon">${u.icon}</span>
        <div class="si-text"><b>${u.name}</b><span class="si-pips">${pips}</span>
          <span class="si-desc">${u.desc}</span></div>
        <button class="btn small ${maxed || !afford ? "grey" : "green"}"
          ${maxed || !afford ? "disabled" : ""} onclick="App.buy('${u.id}')">
          ${maxed ? "Done" : `🪙 ${cost}`}</button>
      </div>`;
    }).join("");
    GK.UI.showScreen("armoury");
  },

  buy(id) {
    const res = Storage.buyUpgrade(this.profile.id, id);
    if (!res.ok) return GK.UI.toast(res.reason === "coins" ? "Not enough coins yet!" : "All bought!");
    this.progress = res.progress;
    this.loadout = upgradeLoadout(this.progress);
    GK.Sfx.purchase();
    GK.UI.toast("Bought! 🎉");
    this.showArmoury();
  },

  showLeaderboard() {
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-stat">🛡️ ${r.progress.siegeScore || 0}</span>` +
        `<span class="lb-stat">⭐ ${Storage.totalStars(r.progress)}</span>`,
      sort: (a, b) => (b.progress.siegeScore || 0) - (a.progress.siegeScore || 0),
      meId: this.profile && this.profile.id,
      empty: "No scores yet — survive a Long Siege!",
    });
    GK.UI.showScreen("leaderboard");
  },

  /* ------------------------------- the loop ---------------------------- */

  frame(ts) {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0);
    this.lastTs = ts;
    if (this.active) {
      if (Game.running && !this.paused) Game.tick(dt);
      Render.update(dt);
      Fx.update(dt);
      Render.render();
      this.updateHud(false);
    }
    GK.Debug.frame(dt);
    requestAnimationFrame((t) => this.frame(t));
  },
};

// Init on DOMContentLoaded, not inline at the bottom of <body>: a first render
// before layout settles resolves viewport-relative clamp() font sizes against
// the inherited value, and only the first screen comes out wrong.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.init());
else App.init();
