import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function nest(flat) {
  const result = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let cur = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return result;
}

for (const lng of ["pt", "en", "fr"]) {
  const flatPath = path.join(__dirname, `definicoes-${lng}-flat.json`);
  const flat = JSON.parse(fs.readFileSync(flatPath, "utf8"));
  const nested = nest(flat);
  const outPath = path.join(root, "src", "locales", lng, "definicoes.json");
  fs.writeFileSync(outPath, JSON.stringify(nested, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath} (${Object.keys(flat).length} keys)`);
}
