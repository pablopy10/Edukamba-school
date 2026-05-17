/**
 * Before each build: sync MARKETING_VERSION from package.json `iosMarketingVersion`, and
 * bump CURRENT_PROJECT_VERSION (CFBundleVersion) in ios/App/App.xcodeproj/project.pbxproj.
 * Invoked via the "prebuild" npm hook so Ionic Appflow picks it up automatically.
 */

const fs = require("fs");
const path = require("path");

const PBXPROJ = path.join(
  __dirname,
  "..",
  "ios",
  "App",
  "App.xcodeproj",
  "project.pbxproj"
);
const PACKAGE_JSON = path.join(__dirname, "..", "package.json");

if (!fs.existsSync(PBXPROJ)) {
  console.log("[bump-ios-version] project.pbxproj not found — skipping (web-only build).");
  process.exit(0);
}

let content = fs.readFileSync(PBXPROJ, "utf8");

/** Sync MARKETING_VERSION → CFBundleShortVersionString (must bump for each App Store / TestFlight "version train"). */
let iosMarketingVersion = null;
if (fs.existsSync(PACKAGE_JSON)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
    if (typeof pkg.iosMarketingVersion === "string" && pkg.iosMarketingVersion.trim()) {
      iosMarketingVersion = pkg.iosMarketingVersion.trim();
    }
  } catch {
    // ignore malformed package.json
  }
}
if (iosMarketingVersion) {
  content = content.replace(
    /MARKETING_VERSION\s*=\s*[^;]+;/g,
    `MARKETING_VERSION = ${iosMarketingVersion};`
  );
  console.log(`[bump-ios-version] MARKETING_VERSION set to ${iosMarketingVersion}`);
}

// Use a timestamp-based version that's always unique and always increasing.
// Formula: Unix timestamp (seconds) + offset so result stays above the last
// manually set value (1758400000). Offset = 12_000_000 puts the floor at
// ~1758.9M today and grows ~86400 per day — guaranteed unique per second.
const OFFSET = 12_000_000;
const next = Math.floor(Date.now() / 1000) + OFFSET;

content = content.replace(/CURRENT_PROJECT_VERSION\s*=\s*\d+;/g, `CURRENT_PROJECT_VERSION = ${next};`);
fs.writeFileSync(PBXPROJ, content, "utf8");

console.log(`[bump-ios-version] CFBundleVersion set to ${next} (timestamp-based)`);
