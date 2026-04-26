// @ts-nocheck
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Minimal .env parser (no extra dependency). Later files override earlier ones.
 */
function loadEnvFile(absolutePath) {
  if (!existsSync(absolutePath)) return;
  const raw = readFileSync(absolutePath, "utf8");
  for (const line of raw.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/** Repo root .env (e.g. t4sg-c4p/.env), then app .env (t4sg-c4p-2026/.env) wins on conflicts. */
export function loadMonorepoEnv() {
  loadEnvFile(join(__dirname, "..", ".env"));
  loadEnvFile(join(__dirname, ".env"));
}
