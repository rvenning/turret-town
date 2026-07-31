# Turret Town 🏰

They're coming up the road. Build something.

A storybook tower defence: place turrets along a winding road, stop the monsters
before they reach your town, and spend what you earn on better ones.

**Play it:** https://rvenning.github.io/turret-town/

Built for Rosalie and up — and deliberately deep enough that the adults want a
go too. Full difficulty progression, real losing, and decisions that keep paying
off twenty waves later.

## Features

- **15 maps across 3 regions** — Green Meadows, Ashfall Ridge and Frostfell —
  ending each region with a boss: a Cinder Dragon, a Stone Titan and the Goblin
  Warlord.
- **Five turrets, three levels each.** Archer Posts are cheap and hit anything;
  Bomb Lobbers wreck crowds but can't reach the sky; Frost Fans chill everything
  in range at once; Tesla Coils chain between monsters; Watchtowers see half the
  map and punch straight through armour.
- **Nine monsters that each break a different plan.** Armour makes a wall of
  cheap arrows stop working. Flyers ignore the road entirely and cut straight
  across. Wisps shrug off the cold. Splitters burst into two when they die, so
  killing them late just moves the problem closer to town.
- **Per-turret targeting** — first, strongest or closest. Letting a Watchtower
  ignore the trash and hold for the Brute is a real decision.
- **Send waves early** with ▶▶ for bonus gold, and run the whole battle at 2×.
  Both are how a confident player squeezes the economy.
- **Armoury** — permanent upgrades bought with coins: starting gold, town walls,
  sharper aim, cheaper turrets, and sandbags that forgive the first monster
  through each map.
- **The Long Siege**, an endless mode that unlocks after five maps. Monster
  health climbs 13% a wave with no ceiling, so it always ends — this is the
  family leaderboard score.
- Family profiles with PINs, cross-device sync, and a leaderboard.
- Installs as a PWA and plays offline.

## Design notes

**The engine has no randomness in it at all.** Monsters spawn on a fixed
schedule, turrets pick targets by a deterministic rule, and damage is a number
rather than a roll. That makes `tests/bot.test.js` an exact replay of the real
engine: a changed clear time in the balance table is a genuine tuning change and
never a bad shuffle.

**Maps are waypoint lists, not ASCII pictures.** Every leg is axis-aligned and
the engine walks between corners to build the road, so the only mistakes
available are geometric — and `tests/levels.test.js` fails on all of them: a
diagonal leg, a corner off the board, a road that crosses itself, a rock sitting
on the road, or a **flyer lane that passes nowhere a turret could reach**. That
last one would ship a map that is unwinnable the moment the first Flitter
appears, and nothing else catches it.

**The balance target is a player who never replays a map.** Playing each map
once in order and spending the coins earned so far on whatever is cheapest, the
bot clears the whole campaign — 39 of 45 stars, and the last four maps at
2★/2★/1★/1★. Losing a map is fine; being unable to get past one is not. The
report also runs an Archer-Posts-only bot (which hits a wall at map 10, so
armour has teeth) and a bot that never builds anything (which loses every map,
so no map can be won by putting the iPad down).

**Sandbags forgive, they don't skip.** A rescue item gets used at exactly one
moment — after the monster is already through — so it refunds the life that was
just lost rather than preventing a future one. Capped at two.

## Built on gamekit

Profiles, storage + family sync, the sound engine, screens/modals, canvas juice
and PWA install all come from [gamekit](https://github.com/rvenning/gamekit),
vendored into `lib/`. To pull in a newer version:

```
node "D:\OneDrive\Documents\Claude Code\gamekit\tools\sync-to-game.js" "D:\OneDrive\Documents\Claude Code\turret-town"
```

Then bump `CACHE` in `sw.js` or devices keep serving the old copy.

## Layout

```
js/towers.js     the five turrets — stats per level, costs, sell value
js/enemies.js    the nine monsters + the three bosses
js/levels.js     15 maps (waypoints, rocks, waves) and the endless siege
js/upgrades.js   the armoury and the coin rewards
js/game.js       the engine — no DOM, no canvas, no audio, no RNG
js/storage.js    gk-storage config + the coin ledger
js/render.js     the canvas and all the input
js/audio.js      synthesized sound + a per-region music track
js/main.js       screens, the build bar, results, the frame loop
tests/           the map linter, the balance bots, the save-data tests
```

## PWA files

`manifest.json`, `sw.js`, `icons/` (regenerate with `npm run icons`).

## Local development

```
npx http-server "D:\OneDrive\Documents\Claude Code\turret-town" -p 8110 -c-1
```

Tests (no framework, Node's built-in runner):

```
npm test
```

The balance table — read this before changing any number in `levels.js`:

```
npm run report
```

`?debug=1` adds a map jumper, a gold cheat and a wave skipper. It also
**disables saving** by design, so never check persistence on a debug URL.

## Storage

`tt_*` localStorage keys, `turrettown` Firestore collection in the shared
`wordvoyage-e5a5c` project. The Firebase config in `js/firebase-config.js` is a
client config, not a secret — the key is restricted to the Cloud Firestore API.

Coins are a two-counter ledger (`coinsEarned` / `coinsSpent`, both monotonic,
balance derived) so that a max() merge across devices can never resurrect spent
coins.
