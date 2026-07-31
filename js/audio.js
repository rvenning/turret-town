// Turret Town — sound. Everything is synthesized through the gamekit WebAudio
// core (lib/gk-audio.js); there are no audio files.
//
// A tower-defence map can have twenty turrets firing at once, which turns any
// per-shot sound into a machine gun and drowns everything that matters. So every
// combat sound goes through `gate()` — a per-key minimum interval. Losing a life
// is never gated; a stray arrow always is.

const Sfx = GK.Sfx;

const _last = {};
function gate(key, ms) {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  if (_last[key] && now - _last[key] < ms) return false;
  _last[key] = now;
  return true;
}

Object.assign(Sfx, {
  /* ---- building ---- */
  place() {
    this.tone({ freq: 220, type: "square", dur: 0.07, vol: 0.13, slide: 160 });
    this.tone({ freq: 520, type: "triangle", dur: 0.1, vol: 0.1, when: 0.06 });
  },
  upgradeUp() {
    [440, 587, 784].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.12, vol: 0.15, when: i * 0.06 }));
  },
  scrap() {
    this.noise({ dur: 0.12, vol: 0.09 });
    this.tone({ freq: 300, type: "square", dur: 0.12, vol: 0.1, slide: -160 });
  },
  denied() { this.tone({ freq: 180, type: "sine", dur: 0.14, vol: 0.1, slide: -40 }); },
  purchase() {
    [523, 659, 880].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.13, vol: 0.16, when: i * 0.07 }));
  },

  /* ---- turrets firing ---- */
  shoot(kind) {
    if (!gate("shot" + kind, 70)) return;
    switch (kind) {
      case "bolt":
        this.tone({ freq: 780, type: "triangle", dur: 0.04, vol: 0.05, slide: -320 });
        break;
      case "bomb":
        this.tone({ freq: 160, type: "sine", dur: 0.09, vol: 0.09, slide: 90 });
        break;
      case "pulse":
        this.noise({ dur: 0.12, vol: 0.035 });
        this.tone({ freq: 1200, type: "sine", dur: 0.12, vol: 0.035, slide: -500 });
        break;
      case "chain":
        this.tone({ freq: 1500, type: "sawtooth", dur: 0.05, vol: 0.06, slide: -900 });
        this.noise({ dur: 0.04, vol: 0.04 });
        break;
      case "beam":
        this.tone({ freq: 900, type: "square", dur: 0.05, vol: 0.09, slide: -600 });
        this.noise({ dur: 0.05, vol: 0.05 });
        break;
    }
  },
  boom() {
    if (!gate("boom", 90)) return;
    this.noise({ dur: 0.22, vol: 0.16 });
    this.tone({ freq: 95, type: "sawtooth", dur: 0.2, vol: 0.14, slide: -40 });
  },
  splat() {
    if (!gate("splat", 55)) return;
    this.tone({ freq: 380, type: "square", dur: 0.07, vol: 0.08, slide: -200 });
    this.noise({ dur: 0.05, vol: 0.05 });
  },
  bossDown() {
    this.noise({ dur: 0.5, vol: 0.28 });
    [880, 660, 440, 220].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.24, vol: 0.17, when: i * 0.12, slide: -60 }));
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.2, vol: 0.18, when: 0.7 + i * 0.1 }));
  },

  /* ---- the town ---- */
  // Warm and low, never a buzzer: a monster got through, the town is still there.
  leak() {
    this.tone({ freq: 300, type: "sine", dur: 0.26, vol: 0.18, slide: -150 });
    this.tone({ freq: 150, type: "sine", dur: 0.3, vol: 0.12, when: 0.06, slide: -50 });
  },
  sandbag() {
    this.noise({ dur: 0.14, vol: 0.1 });
    this.tone({ freq: 420, type: "triangle", dur: 0.16, vol: 0.14, when: 0.06, slide: 180 });
  },
  waveHorn() {
    [196, 262, 330].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.26, vol: 0.11, when: i * 0.05 }));
  },
  bossHorn() {
    [110, 110, 98].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.4, vol: 0.2, when: i * 0.3, slide: -12 }));
    this.noise({ dur: 0.4, vol: 0.08, when: 0.6 });
  },
  waveClear() {
    [659, 880, 1047].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.12, vol: 0.13, when: i * 0.06 }));
  },
  rush() {
    this.tone({ freq: 660, type: "square", dur: 0.08, vol: 0.1, slide: 420 });
    this.tone({ freq: 1320, type: "triangle", dur: 0.09, vol: 0.08, when: 0.07 });
  },
  star(i) {
    this.tone({ freq: [660, 880, 1175][i] || 880, type: "triangle", dur: 0.2, vol: 0.2 });
    this.tone({ freq: ([660, 880, 1175][i] || 880) * 1.5, type: "sine", dur: 0.22, vol: 0.1, when: 0.05 });
  },
  victory() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.18, vol: 0.2, when: i * 0.1 }));
  },
  townFell() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.3, vol: 0.18, when: i * 0.16, slide: -30 }));
    this.noise({ dur: 0.5, vol: 0.1, when: 0.5 });
  },
});

/* ================= Music =================
 * One track per region, plus a boss variant of whichever is playing. Notes are
 * 8th-note steps as semitone offsets from `root` (null = rest); a lookahead pump
 * schedules them on the WebAudio clock, so timing survives a sloppy interval and
 * a hidden tab (where setInterval is throttled to about 1Hz) resumes cleanly
 * instead of firing every missed note at once.
 */
const TRACKS = [
  { // Green Meadows — bright and marchy
    bpm: 108, root: 262, leadType: "triangle", bassType: "triangle", drums: "light",
    bass: [-24, null, null, null, -17, null, -20, null, -24, null, null, null, -17, null, -20, null,
           -22, null, null, null, -15, null, -19, null, -24, null, -20, null, -17, null, -12, null],
    lead: [0, null, 4, null, 7, null, null, null, 9, null, 7, null, 4, null, null, null,
           2, null, 5, null, 9, null, null, null, 7, null, null, null, null, null, null, null,
           0, null, 4, null, 7, null, 12, null, 11, null, 9, null, 7, null, null, null,
           5, null, 4, null, 2, null, 4, null, 0, null, null, null, null, null, null, null],
  },
  { // Ashfall Ridge — hotter, minor, restless
    bpm: 120, root: 220, leadType: "square", bassType: "sawtooth", drums: "drive",
    bass: [-24, -24, null, -24, -19, null, -17, null, -24, -24, null, -24, -19, null, -15, null,
           -24, -24, null, -24, -20, null, -17, null, -22, null, -20, null, -19, null, -17, null],
    lead: [0, null, 3, null, 7, null, 3, null, 5, null, 3, null, 0, null, null, null,
           0, null, 3, null, 10, null, 7, null, 5, null, 3, null, 2, null, null, null,
           12, null, 10, null, 7, null, 5, null, 3, null, 5, null, 7, null, null, null,
           10, null, 7, null, 5, null, 3, null, 0, null, null, null, null, null, null, null],
  },
  { // Frostfell — sparse, cold, a little grand
    bpm: 92, root: 196, leadType: "sine", bassType: "triangle", drums: "light",
    bass: [-24, null, null, null, null, null, -17, null, -24, null, null, null, null, null, -19, null,
           -22, null, null, null, null, null, -15, null, -24, null, -19, null, -17, null, -12, null],
    lead: [7, null, null, null, 4, null, null, null, 0, null, 4, null, 7, null, null, null,
           9, null, null, null, 7, null, null, null, 4, null, null, null, null, null, null, null,
           12, null, null, null, 11, null, 9, null, 7, null, 4, null, 2, null, null, null,
           0, null, 4, null, 7, null, 12, null, 7, null, null, null, null, null, null, null],
  },
];

const Music = {
  enabled: true,          // separate from Sfx.enabled; persisted in settings
  _pump: null, _step: 0, _nextT: 0, _trk: null, _boss: false,

  start(regionIdx, boss = false) {
    this.stop();
    this._trk = TRACKS[Math.min(regionIdx, TRACKS.length - 1)];
    this._boss = boss;
    this._step = 0;
    this._nextT = Sfx.ctx ? Sfx.ctx.currentTime + 0.15 : 0;
    this._pump = setInterval(() => this.pump(), 110);
  },

  // Bosses only announce themselves on the last wave, so the track shifts gear
  // mid-level rather than restarting.
  goBoss() { this._boss = true; },

  pump() {
    if (!Sfx.ctx || !this._trk) return;
    const now = Sfx.ctx.currentTime;
    if (!Sfx.enabled || !this.enabled || !App.active || App.paused) {
      this._nextT = Math.max(this._nextT, now + 0.15);
      return;
    }
    const bpm = this._boss ? this._trk.bpm * 1.22 : this._trk.bpm;
    const stepDur = 60 / bpm / 2;
    while (this._nextT < now - 0.05) { this._step++; this._nextT += stepDur; }
    while (this._nextT < now + 0.6) {
      this.scheduleStep(this._step, Math.max(0, this._nextT - now), stepDur);
      this._step++;
      this._nextT += stepDur;
    }
  },

  scheduleStep(s, when, stepDur) {
    const t = this._trk, boss = this._boss;
    const note = (semi, oct = 0) => t.root * Math.pow(2, (semi + oct) / 12);

    let b = t.bass[s % 32];
    if (boss) b = [-24, null, -24, null][s % 4] ?? b;
    if (b !== null && b !== undefined) {
      Sfx.tone({ freq: note(b), type: boss ? "sawtooth" : t.bassType,
                 dur: stepDur * 1.7, vol: boss ? 0.08 : 0.055, when });
    }

    const l = t.lead[s % 64];
    if (l !== null && l !== undefined) {
      Sfx.tone({ freq: note(l, boss ? -12 : 0), type: boss ? "square" : t.leadType,
                 dur: stepDur * 1.6, vol: 0.05, when });
    }

    const drums = boss ? "drive" : t.drums;
    if (drums !== "none") {
      const inBar = s % 8;
      if (inBar === 0) Sfx.tone({ freq: 62, type: "sine", dur: 0.09, vol: 0.07, when, slide: -25 });
      if (inBar === 4 && drums === "drive") Sfx.noise({ dur: 0.07, vol: 0.045, when });
      if (inBar % 2 === 1) Sfx.noise({ dur: 0.02, vol: drums === "drive" ? 0.02 : 0.011, when });
    }
  },

  toggle() {
    this.enabled = !this.enabled;
    const s = Storage.getSettings();
    s.music = this.enabled;
    Storage.saveSettings(s);
    return this.enabled;
  },

  stop() {
    if (this._pump) { clearInterval(this._pump); this._pump = null; }
    this._trk = null;
  },
};
