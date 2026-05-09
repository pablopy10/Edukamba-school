/**
 * Automatically increments CURRENT_PROJECT_VERSION in project.pbxproj before each build.
 * Called via the "prebuild" npm hook so Ionic Appflow picks it up automatically.
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

if (!fs.existsSync(PBXPROJ)) {
  console.log("[bump-ios-version] project.pbxproj not found — skipping (web-only build).");
  process.exit(0);
}

let content = fs.readFileSync(PBXPROJ, "utf8");

const match = content.match(/CURRENT_PROJECT_VERSION\s*=\s*(\d+);/);
if (!match) {
  console.warn("[bump-ios-version] CURRENT_PROJECT_VERSION not found in project.pbxproj — skipping.");
  process.exit(0);
}

const current = parseInt(match[1], 10);
const next = current + 100000;

content = content.replace(/CURRENT_PROJECT_VERSION\s*=\s*\d+;/g, `CURRENT_PROJECT_VERSION = ${next};`);
fs.writeFileSync(PBXPROJ, content, "utf8");

console.log(`[bump-ios-version] CFBundleVersion bumped: ${current} → ${next}`);
