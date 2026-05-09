/**
 * Generates ALL required iOS AppIcon sizes from resources/icon.png
 * and writes the correct Contents.json for AppIcon.appiconset.
 * Notification icons on iOS require the 20pt sizes to be present.
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "resources", "icon.png");
const ICONSET = path.join(
  __dirname, "..", "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset"
);

// All required iOS icon sizes (name, pt size, scale)
const ICONS = [
  // Notification icons (critical for push notifications)
  { file: "AppIcon-20x20@1x.png",     size: 20  },
  { file: "AppIcon-20x20@2x.png",     size: 40  },
  { file: "AppIcon-20x20@3x.png",     size: 60  },
  // Settings icons
  { file: "AppIcon-29x29@1x.png",     size: 29  },
  { file: "AppIcon-29x29@2x.png",     size: 58  },
  { file: "AppIcon-29x29@3x.png",     size: 87  },
  // Spotlight icons
  { file: "AppIcon-40x40@1x.png",     size: 40  },
  { file: "AppIcon-40x40@2x.png",     size: 80  },
  { file: "AppIcon-40x40@3x.png",     size: 120 },
  // App icons
  { file: "AppIcon-60x60@2x.png",     size: 120 },
  { file: "AppIcon-60x60@3x.png",     size: 180 },
  // iPad icons
  { file: "AppIcon-76x76@1x.png",     size: 76  },
  { file: "AppIcon-76x76@2x.png",     size: 152 },
  { file: "AppIcon-83.5x83.5@2x.png", size: 167 },
  // App Store / 1024
  { file: "AppIcon-512@2x.png",       size: 1024 },
];

// Contents.json entries matching the icons above
const CONTENTS = {
  images: [
    { idiom: "iphone", scale: "1x", size: "20x20",      filename: "AppIcon-20x20@1x.png" },
    { idiom: "iphone", scale: "2x", size: "20x20",      filename: "AppIcon-20x20@2x.png" },
    { idiom: "iphone", scale: "3x", size: "20x20",      filename: "AppIcon-20x20@3x.png" },
    { idiom: "iphone", scale: "1x", size: "29x29",      filename: "AppIcon-29x29@1x.png" },
    { idiom: "iphone", scale: "2x", size: "29x29",      filename: "AppIcon-29x29@2x.png" },
    { idiom: "iphone", scale: "3x", size: "29x29",      filename: "AppIcon-29x29@3x.png" },
    { idiom: "iphone", scale: "1x", size: "40x40",      filename: "AppIcon-40x40@1x.png" },
    { idiom: "iphone", scale: "2x", size: "40x40",      filename: "AppIcon-40x40@2x.png" },
    { idiom: "iphone", scale: "3x", size: "40x40",      filename: "AppIcon-40x40@3x.png" },
    { idiom: "iphone", scale: "2x", size: "60x60",      filename: "AppIcon-60x60@2x.png" },
    { idiom: "iphone", scale: "3x", size: "60x60",      filename: "AppIcon-60x60@3x.png" },
    { idiom: "ipad",   scale: "1x", size: "20x20",      filename: "AppIcon-20x20@1x.png" },
    { idiom: "ipad",   scale: "2x", size: "20x20",      filename: "AppIcon-20x20@2x.png" },
    { idiom: "ipad",   scale: "1x", size: "29x29",      filename: "AppIcon-29x29@1x.png" },
    { idiom: "ipad",   scale: "2x", size: "29x29",      filename: "AppIcon-29x29@2x.png" },
    { idiom: "ipad",   scale: "1x", size: "40x40",      filename: "AppIcon-40x40@1x.png" },
    { idiom: "ipad",   scale: "2x", size: "40x40",      filename: "AppIcon-40x40@2x.png" },
    { idiom: "ipad",   scale: "1x", size: "76x76",      filename: "AppIcon-76x76@1x.png" },
    { idiom: "ipad",   scale: "2x", size: "76x76",      filename: "AppIcon-76x76@2x.png" },
    { idiom: "ipad",   scale: "2x", size: "83.5x83.5",  filename: "AppIcon-83.5x83.5@2x.png" },
    { idiom: "ios-marketing", scale: "1x", size: "1024x1024", filename: "AppIcon-512@2x.png" },
  ],
  info: { author: "xcode", version: 1 },
};

async function generate() {
  if (!fs.existsSync(SOURCE)) {
    console.warn("[ios-icons] resources/icon.png not found — skipping.");
    return;
  }
  if (!fs.existsSync(ICONSET)) {
    console.warn("[ios-icons] AppIcon.appiconset not found — skipping (Android-only build?).");
    return;
  }

  // Generate each size
  for (const { file, size } of ICONS) {
    await sharp(SOURCE)
      .resize(size, size, { fit: "cover", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile(path.join(ICONSET, file));
    console.log(`[ios-icons] ${file} (${size}×${size})`);
  }

  // Write Contents.json
  fs.writeFileSync(
    path.join(ICONSET, "Contents.json"),
    JSON.stringify(CONTENTS, null, 2),
    "utf8"
  );
  console.log("[ios-icons] Contents.json written.");
  console.log(`[ios-icons] Done — ${ICONS.length} icons generated.`);
}

generate().catch((err) => {
  console.error("[ios-icons] Error:", err);
  process.exit(1);
});
