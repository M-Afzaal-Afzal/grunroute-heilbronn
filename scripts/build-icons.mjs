// Renders the app icons and logo PNGs from the brand SVGs.
// Run: node scripts/build-icons.mjs
import { readFileSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import sharp from "sharp";

const icon = readFileSync("brand/icons/icon.svg", "utf8");
const INK = "#0F2A23";

// The mark without its rounded tile, so it can sit on any square.
const inner = icon.replace(/^.*?<rect[^>]*\/>/s, "").replace(/<\/svg>\s*$/, "");
const square = (scale) => {
  const off = (120 - 120 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="${INK}"/><g transform="translate(${off} ${off}) scale(${scale})">${inner}</g></svg>`;
};

// Render at twice the size, then scale down for clean edges.
const png = (svg, w, h = w) =>
  sharp(Buffer.from(svg), { density: (144 * w) / Number(svg.match(/width="(\d+)"/)[1]) })
    .resize(w, h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

// Tile with round corners: browsers, PWA "any" icons.
for (const s of [16, 32, 48, 64, 180, 192, 512]) {
  writeFileSync(`brand/icons/icon-${s}.png`, await png(icon, s));
}
// iOS rounds the corners itself and fills transparent ones black, so a full square.
writeFileSync("brand/icons/apple-touch-icon.png", await png(square(1), 180));
// Android masks to a circle or squircle: keep the mark inside the middle 80 %.
writeFileSync("brand/icons/maskable-512.png", await png(square(0.72), 512));

// favicon.ico holding 16, 32 and 48 px PNGs.
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map((s) => png(icon, s)));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let at = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e);
  head.writeUInt8(s, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(imgs[i].length, e + 8);
  head.writeUInt32LE(at, e + 12);
  at += imgs[i].length;
});
writeFileSync("brand/icons/favicon.ico", Buffer.concat([head, ...imgs]));

// Logo PNGs: marks at 1024, wide lockups at 4x their SVG size.
for (const f of readdirSync("brand/logo/svg")) {
  const svg = readFileSync(`brand/logo/svg/${f}`, "utf8");
  const name = f.replace(/\.svg$/, "");
  if (name === "mark-ink-round") continue;
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
  const out = name.startsWith("mark-") ? `${name}-1024.png` : `${name}.png`;
  const k = name.startsWith("mark-") ? 1024 / w : 4;
  writeFileSync(`brand/logo/png/${out}`, await png(svg, Math.round(w * k), Math.round(h * k)));
}

// Copies the app serves.
copyFileSync("brand/icons/icon.svg", "app/icon.svg");
copyFileSync("brand/icons/favicon.ico", "app/favicon.ico");
copyFileSync("brand/icons/apple-touch-icon.png", "app/apple-icon.png");
for (const f of ["icon-192.png", "icon-512.png", "maskable-512.png"]) {
  copyFileSync(`brand/icons/${f}`, `public/brand/${f}`);
}
console.log("icons ok");
