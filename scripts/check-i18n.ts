import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.resolve(__dirname, "../apps/web/src/locales");
const baseLocale = "en";
const targetLocales = ["ne", "hi", "es", "fr", "pt", "ja"];

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      keys = keys.concat(flattenKeys(v as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

function loadLocale(code: string): { path: string; keys: string[] } {
  const filePath = path.join(localesDir, `${code}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Locale file missing: ${filePath}`);
  }
  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return { path: filePath, keys: flattenKeys(content) };
}

console.log("Checking i18n locale keys against base locale (en.json)...");

const base = loadLocale(baseLocale);
console.log(`Base locale 'en' has ${base.keys.length} keys.`);

let hasError = false;

for (const code of targetLocales) {
  try {
    const target = loadLocale(code);
    const missing = base.keys.filter((k) => !target.keys.includes(k));
    const extra = target.keys.filter((k) => !base.keys.includes(k));

    if (missing.length > 0 || extra.length > 0) {
      hasError = true;
      console.error(`\n❌ [${code}.json] Key mismatch:`);
      if (missing.length > 0) {
        console.error(`   Missing keys (${missing.length}):\n     - ${missing.join("\n     - ")}`);
      }
      if (extra.length > 0) {
        console.error(`   Extra/unused keys (${extra.length}):\n     - ${extra.join("\n     - ")}`);
      }
    } else {
      console.log(`✓ [${code}.json] OK (${target.keys.length} keys match).`);
    }
  } catch (err) {
    hasError = true;
    console.error(`\n❌ Failed to check locale ${code}:`, err);
  }
}

if (hasError) {
  console.error("\n❌ i18n key check failed. Keep all locales in sync with en.json.");
  process.exit(1);
} else {
  console.log("\n✅ All 7 locales are in 100% key parity with en.json!");
  process.exit(0);
}
