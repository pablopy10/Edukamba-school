/**
 * Generates ic_stat_onesignal_default.png for Android push notifications.
 * Android requires the small notification icon to be a white silhouette on transparent background.
 * Reads resources/icon.png, converts it to white-on-transparent, and saves to all drawable densities.
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Android drawable density sizes for notification icons (dp sizes × density)
const DENSITIES = [
  { dir: "drawable-mdpi",   size: 24  },
  { dir: "drawable-hdpi",   size: 36  },
  { dir: "drawable-xhdpi",  size: 48  },
  { dir: "drawable-xxhdpi", size: 72  },
  { dir: "drawable-xxxhdpi",size: 96  },
];

const SOURCE = path.join(__dirname, "..", "resources", "icon.png");
const ANDROID_RES = path.join(__dirname, "..", "android", "app", "src", "main", "res");
const ICON_NAME = "ic_stat_onesignal_default.png";

async function generateNotificationIcon() {
  if (!fs.existsSync(SOURCE)) {
    console.warn("[notification-icon] resources/icon.png not found — skipping.");
    return;
  }

  for (const { dir, size } of DENSITIES) {
    const outDir = path.join(ANDROID_RES, dir);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const outFile = path.join(outDir, ICON_NAME);

    // Resize, extract alpha channel, then make all opaque pixels white
    await sharp(SOURCE)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      // Replace RGB channels with white, keep alpha from luminance of original
      .recomb([
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ])
      // Flatten won't work — use threshold + negate trick:
      // 1. Convert to greyscale to get luminance mask
      // 2. Threshold to binary
      // 3. Use as alpha on a white canvas
      .toBuffer()
      .then(async () => {
        // Better approach: resize original, threshold alpha from any non-transparent pixel
        const { data, info } = await sharp(SOURCE)
          .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const pixels = new Uint8Array(data);
        const out = Buffer.alloc(pixels.length);

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          // Any pixel that is NOT near-pure-white AND has visible alpha → white on transparent.
          // This preserves light blue (#bfdbfe → r=191) and dark elements alike,
          // while making the white background transparent.
          const isNearWhite = r > 230 && g > 230 && b > 230;
          const isVisible = a > 10;
          const keep = !isNearWhite && isVisible;

          out[i]     = 255; // R = white
          out[i + 1] = 255; // G = white
          out[i + 2] = 255; // B = white
          out[i + 3] = keep ? 255 : 0;
        }

        await sharp(out, {
          raw: { width: info.width, height: info.height, channels: 4 },
        })
          .png()
          .toFile(outFile);

        console.log(`[notification-icon] ${dir}/${ICON_NAME} (${size}×${size})`);
      });
  }

  console.log("[notification-icon] Android notification icons generated successfully.");
}

generateNotificationIcon().catch((err) => {
  console.error("[notification-icon] Error:", err);
  process.exit(1);
});
