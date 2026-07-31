// Turret Town icons: a stone turret with a red roof standing beside the road.
// Storybook look, so everything gets a thick ink outline — drawn as a slightly
// larger ink shape behind each fill, since png.js only fills.
//
//   $env:Path += ';C:\Program Files\nodejs'
//   node tools/make-icons.js

const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const INK = "#22201e";
const PAGE = "#f4ead6";
const GRASS = "#6ea83f";
const GRASS_LT = "#79b446";
const ROAD = "#c9a06a";
const ROAD_DK = "#8a6540";
const STONE = "#d9cdb4";
const STONE_DK = "#b9a984";
const BRICK = "#b8452f";
const GOLD = "#ffd63d";

// `art` scales the turret about the centre. The maskable icon uses a smaller
// value so the art survives a circular or squircle crop.
function paint(size, art) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;                        // one unit = 1% of the icon
  const mid = big / 2;

  cv.fillRect(0, 0, big, big, PAGE);
  cv.fillRect(0, 38 * u, big, 62 * u, GRASS);
  cv.fillRect(0, 38 * u, big, 2 * u, INK);
  for (let i = 0; i < 7; i++) cv.fillRect((3 + i * 14) * u, (46 + (i % 3) * 13) * u, 6 * u, 2 * u, GRASS_LT);

  // The road, bending across the grass behind the turret.
  cv.fillRect(0, 60 * u, big, 16 * u, ROAD_DK);
  cv.fillRect(0, 62 * u, big, 12 * u, ROAD);
  for (let i = 0; i < 6; i++) cv.fillRect((6 + i * 16) * u, 62 * u, 2 * u, 12 * u, ROAD_DK, 0.5);

  // The turret.
  const w = 30 * u * art, h = 44 * u * art;
  const x = mid - w / 2, y = mid - h * 0.55;
  const o = 3 * u * art;

  cv.fillRoundRect(x - o, y - o, w + o * 2, h + o * 2, 5 * u * art, INK);
  cv.fillRoundRect(x, y, w, h, 4 * u * art, STONE);
  cv.fillRect(x + w * 0.62, y, w * 0.38, h, STONE_DK);

  // Crenellations along the top.
  for (let i = 0; i < 3; i++) {
    const cw = w / 5;
    cv.fillRect(x + i * cw * 2 - o * 0.6, y - 6 * u * art - o, cw + o * 1.2, 7 * u * art + o, INK);
    cv.fillRect(x + i * cw * 2, y - 6 * u * art, cw, 7 * u * art, STONE);
  }

  // Roof.
  const ry = y - 9 * u * art;
  cv.fillTriangle(mid - w * 0.72 - o, ry, mid, ry - 20 * u * art - o, mid + w * 0.72 + o, ry, INK);
  cv.fillTriangle(mid - w * 0.7, ry - 1.5 * u * art, mid, ry - 20 * u * art, mid + w * 0.7, ry - 1.5 * u * art, BRICK);

  // A gold arrow-slit, so the thing reads as a turret and not a chimney.
  cv.fillRoundRect(mid - 5 * u * art - o, y + h * 0.34 - o, 10 * u * art + o * 2, 15 * u * art + o * 2, 4 * u * art, INK);
  cv.fillRoundRect(mid - 5 * u * art, y + h * 0.34, 10 * u * art, 15 * u * art, 3 * u * art, GOLD);

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });

const files = [
  ["icon-192.png", 192, 1.0],
  ["icon-512.png", 512, 1.0],
  ["maskable-512.png", 512, 0.72],
];

for (const [name, size, art] of files) {
  fs.writeFileSync(path.join(out, name), paint(size, art));
  console.log(`icons/${name}`);
}
