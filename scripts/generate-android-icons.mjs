/**
 * Generates all Android mipmap ic_launcher PNGs from the Edukamba logo.
 * The logo (horizontal wordmark) is centred on a white square canvas.
 * Run: node scripts/generate-android-icons.mjs
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "public", "edukamba-logo.png");
const RES = path.join(ROOT, "android", "app", "src", "main", "res");

// icon sizes per density (square launcher icon)
const SIZES = [
  { dir: "mipmap-mdpi",    size: 48  },
  { dir: "mipmap-hdpi",    size: 72  },
  { dir: "mipmap-xhdpi",   size: 96  },
  { dir: "mipmap-xxhdpi",  size: 144 },
  { dir: "mipmap-xxxhdpi", size: 192 },
];

// foreground sizes (108dp canvas used by adaptive icons)
const FG_SIZES = [
  { dir: "mipmap-mdpi",    size: 108 },
  { dir: "mipmap-hdpi",    size: 162 },
  { dir: "mipmap-xhdpi",   size: 216 },
  { dir: "mipmap-xxhdpi",  size: 324 },
  { dir: "mipmap-xxxhdpi", size: 432 },
];

async function makeIcon(size) {
  const padding = Math.round(size * 0.15);
  const inner = size - padding * 2;
  const meta = await sharp(SRC).metadata();
  const ratio = meta.width / meta.height;

  // fit logo inside the inner area keeping aspect ratio
  let w, h;
  if (ratio > 1) { w = inner; h = Math.round(inner / ratio); }
  else           { h = inner; w = Math.round(inner * ratio); }

  const resized = await sharp(SRC).resize(w, h, { fit: "inside" }).toBuffer();

  return sharp({
    create: {
      width: size, height: size, channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();
}

async function makeForeground(size) {
  // foreground: logo on transparent background (adaptive icon system clips to circle/squircle)
  const safe = Math.round(size * 0.667); // inner 72dp of 108dp
  const padding = Math.round(safe * 0.1);
  const inner = safe - padding * 2;
  const meta = await sharp(SRC).metadata();
  const ratio = meta.width / meta.height;

  let w, h;
  if (ratio > 1) { w = inner; h = Math.round(inner / ratio); }
  else           { h = inner; w = Math.round(inner * ratio); }

  const resized = await sharp(SRC).resize(w, h, { fit: "inside" }).toBuffer();

  return sharp({
    create: {
      width: size, height: size, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();
}

(async () => {
  console.log("Generating Android launcher icons…");

  for (const { dir, size } of SIZES) {
    const outDir = path.join(RES, dir);
    fs.mkdirSync(outDir, { recursive: true });

    const buf = await makeIcon(size);
    fs.writeFileSync(path.join(outDir, "ic_launcher.png"), buf);
    fs.writeFileSync(path.join(outDir, "ic_launcher_round.png"), buf);
    console.log(`  ✓ ${dir} ${size}×${size}`);
  }

  for (const { dir, size } of FG_SIZES) {
    const outDir = path.join(RES, dir);
    fs.mkdirSync(outDir, { recursive: true });
    const buf = await makeForeground(size);
    fs.writeFileSync(path.join(outDir, "ic_launcher_foreground.png"), buf);
    console.log(`  ✓ ${dir} foreground ${size}×${size}`);
  }

  console.log("Done.");
})();
