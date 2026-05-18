import fs from "fs";

const loc = process.argv[2];
if (!loc || !["pt", "fr"].includes(loc)) {
  console.error("Usage: node scripts/merge-four-ns-into-pages.mjs <pt|fr>");
  process.exit(1);
}

const blobPath = new URL(`./fourNs.${loc}.json`, import.meta.url);
const pagesPath = new URL(`../src/locales/${loc}/pages.json`, import.meta.url);

const inserted = JSON.parse(fs.readFileSync(blobPath, "utf8"));
const pages = JSON.parse(fs.readFileSync(pagesPath, "utf8"));
const ordered = {};
for (const k of Object.keys(pages)) {
  if (k === "modulos") {
    for (const ns of ["disciplinas", "educadores", "horarios", "presencas"]) {
      ordered[ns] = inserted[ns];
    }
    ordered.modulos = pages.modulos;
  } else {
    ordered[k] = pages[k];
  }
}

fs.writeFileSync(pagesPath, `${JSON.stringify(ordered, null, 2)}\n`);
