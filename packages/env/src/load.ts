/**
 * Loader env terpusat — memuat `.env` dari ROOT workspace monorepo.
 *
 * "Single file of truth": semua konsumen (Next.js web, worker, tooling DB,
 * drizzle-kit, test) membaca satu `.env` di root, bukan `.env` per-package.
 *
 * Cara kerja: naik dari CWD hingga menemukan `pnpm-workspace.yaml` (penanda root),
 * lalu `dotenv.config` memuat `$ROOT/.env`. `override: false` → nilai dari
 * environment proses (mis. docker compose) tetap menang.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function findWorkspaceRoot(startDir?: string): string | null {
  let dir = startDir ? resolve(startDir) : process.cwd();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Path `.env` di root workspace (untuk tooling yang butuh path eksplisit). */
export function rootEnvPath(): string | null {
  const root = findWorkspaceRoot();
  if (!root) return null;
  const envPath = join(root, ".env");
  return existsSync(envPath) ? envPath : null;
}

/**
 * Muat `.env` root ke process.env. No-op bila file tidak ada.
 * Idempoten — aman dipanggil berkali-kali.
 */
export function loadRootEnv(): void {
  const envPath = rootEnvPath();
  if (!envPath) return;
  loadEnv({ path: envPath, override: false, quiet: true });
}

/** Path absolut root workspace. */
export function workspaceRootDir(startDir?: string): string {
  const root = findWorkspaceRoot(startDir);
  if (!root) {
    // Fallback: asumsi CWD sudah root.
    return resolve(/*turbopackIgnore: true*/ startDir ?? process.cwd());
  }
  return root;
}

// Gunakan __dirname yang benar di ESM.
const __filename = fileURLToPath(import.meta.url);
export const THIS_FILE_DIR = dirname(__filename);
