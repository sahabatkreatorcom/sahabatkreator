// CSV Bulk Import — parse CSV post massal + validasi per baris.
// Format kolom (header wajib baris pertama):
//   caption (wajib), platforms (mis. "instagram,tiktok"), scheduled_date (YYYY-MM-DD),
//   scheduled_time (HH:mm), hashtags (tanpa #), link, first_comment
//
// Baris divalidasi: platform harus tersambung, tanggal valid & di masa depan,
// caption tidak kosong. Return per-baris status valid/warning/error.

import { db } from "@sahabatkreator/db";
import { post, postGroup, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { generateId } from "./id";

/** Hasil parse satu baris */
export type CsvRowResult = {
  row: number;
  status: "valid" | "error";
  caption: string;
  platforms: string[];
  scheduledAt: string | null;
  errors: string[];
  /** Post group id yang dibuat (bila valid & di-import) */
  postGroupId?: string;
};

export type ImportResult = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  imported: number;
  rows: CsvRowResult[];
};

/** Parse CSV sederhana dengan dukungan quote & koma di dalam quote */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      current.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // \r\n → satu newline
      if (char === "\r" && text[i + 1] === "\n") i++;
      current.push(field);
      field = "";
      // skip baris benar-benar kosong
      if (current.some((f) => f.trim() !== "")) {
        rows.push(current);
      }
      current = [];
    } else {
      field += char;
    }
  }
  // field terakhir
  current.push(field);
  if (current.some((f) => f.trim() !== "")) {
    rows.push(current);
  }
  return rows;
}

const VALID_PLATFORMS = new Set([
  "instagram",
  "instagram_standalone",
  "facebook",
  "threads",
  "tiktok",
  "youtube",
  "pinterest",
  "linkedin",
  "linkedin_org",
  "bluesky",
  "google_business",
  "manual",
]);

type ParsedRow = {
  caption: string;
  platforms: string[];
  scheduledDate: string | null;
  scheduledTime: string | null;
  hashtags: string[];
  firstComment: string | null;
};

/** Map header + baris → objek dengan kolom dikenal */
function toRow(header: string[], cells: string[]): ParsedRow {
  const get = (name: string): string => {
    const idx = header.indexOf(name.toLowerCase().trim());
    return idx >= 0 ? (cells[idx] ?? "").trim() : "";
  };
  return {
    caption: get("caption"),
    platforms: get("platforms")
      .split(/[;,|]/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean),
    scheduledDate: get("scheduled_date") || null,
    scheduledTime: get("scheduled_time") || null,
    hashtags: get("hashtags")
      .split(/[ ,;|]/)
      .map((h) => h.trim().replace(/^#/, ""))
      .filter(Boolean),
    firstComment: get("first_comment") || null,
  };
}

/** Validasi + import baris CSV. importMode=true → benar-benar insert ke DB. */
export async function importCsvPosts(
  organizationId: string,
  csvText: string,
  userId: string,
  opts: { importMode: boolean },
): Promise<ImportResult> {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error("CSV kosong atau tanpa baris data — butuh header + minimal 1 baris.");
  }

  const header = rows[0]!.map((h) => h.trim());
  if (!header.some((h) => h.toLowerCase() === "caption")) {
    throw new Error("Kolom 'caption' wajib ada di baris pertama CSV.");
  }

  // Akun tersambung milik org — untuk validasi platform
  const accounts = await db
    .select({
      id: socialAccount.id,
      platform: socialAccount.platform,
      username: socialAccount.username,
    })
    .from(socialAccount)
    .where(
      and(eq(socialAccount.organizationId, organizationId), eq(socialAccount.isConnected, true)),
    );
  const accountByPlatform = new Map<string, { id: string; username: string }[]>();
  for (const acc of accounts) {
    const list = accountByPlatform.get(acc.platform) ?? [];
    list.push({ id: acc.id, username: acc.username });
    accountByPlatform.set(acc.platform, list);
  }

  const results: CsvRowResult[] = [];
  let imported = 0;

  for (let i = 1; i < rows.length; i++) {
    const parsed = toRow(header, rows[i]!);
    const errors: string[] = [];
    const rowResult: CsvRowResult = {
      row: i,
      status: "valid",
      caption: parsed.caption,
      platforms: parsed.platforms,
      scheduledAt: null,
      errors,
    };

    // --- Validasi ---
    if (!parsed.caption) {
      errors.push("caption kosong");
    }
    if (parsed.platforms.length === 0) {
      errors.push("platforms kosong — isi mis. 'instagram,tiktok'");
    }
    for (const platform of parsed.platforms) {
      if (!VALID_PLATFORMS.has(platform)) {
        errors.push(`platform '${platform}' tidak dikenal`);
      } else if (!accountByPlatform.has(platform)) {
        errors.push(`akun ${platform} belum tersambung`);
      }
    }

    // Tanggal: wajib bila ada date ATAU time
    let scheduledAt: Date | null = null;
    if (parsed.scheduledDate || parsed.scheduledTime) {
      const dateStr = parsed.scheduledDate ?? "";
      const timeStr = parsed.scheduledTime ?? "09:00";
      const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) {
        errors.push("scheduled_date harus format YYYY-MM-DD");
      } else if (!timeMatch) {
        errors.push("scheduled_time harus format HH:mm");
      } else {
        // Asia/Jakarta (UTC+7) — sama dengan compose
        scheduledAt = new Date(`${match[0]}T${timeStr.padStart(5, "0")}:00+07:00`);
        if (Number.isNaN(scheduledAt.getTime())) {
          errors.push("tanggal/waktu tidak valid");
          scheduledAt = null;
        } else if (scheduledAt.getTime() < Date.now()) {
          errors.push("jadwal sudah lewat");
        }
      }
      rowResult.scheduledAt = scheduledAt ? scheduledAt.toISOString() : null;
    }

    if (errors.length > 0) {
      rowResult.status = "error";
      results.push(rowResult);
      continue;
    }

    // --- Import ---
    if (opts.importMode) {
      const groupId = generateId("pg");
      const content = parsed.hashtags.length
        ? `${parsed.caption}\n\n${parsed.hashtags.map((h) => `#${h}`).join(" ")}`
        : parsed.caption;

      await db.insert(postGroup).values({
        id: groupId,
        organizationId,
        content,
        scheduledAt,
        createdByUserId: userId,
      });

      // Post per platform (akun pertama platform tersebut)
      const accountIds = parsed.platforms
        .map((p) => accountByPlatform.get(p)?.[0]?.id)
        .filter((id): id is string => Boolean(id));

      await db.insert(post).values(
        accountIds.map((accountId) => {
          const platform = accounts.find((a) => a.id === accountId)!.platform;
          return {
            id: generateId("post"),
            organizationId,
            postGroupId: groupId,
            socialAccountId: accountId,
            platform,
            status: scheduledAt ? ("scheduled" as const) : ("draft" as const),
            content,
            hashtags: parsed.hashtags,
            firstComment: parsed.firstComment,
          };
        }),
      );
      rowResult.postGroupId = groupId;
      imported++;
    }

    results.push(rowResult);
  }

  return {
    totalRows: rows.length - 1,
    validRows: results.filter((r) => r.status === "valid").length,
    errorRows: results.filter((r) => r.status === "error").length,
    imported,
    rows: results,
  };
}
