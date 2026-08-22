import { withAdmin, json } from "@/lib/api";
import { env } from "@sahabat-kreator/env/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/secrets/status — laporan apakah semua kunci rahasia utama sudah dikonfigurasi.
 * Tidak mengembalikan nilai aktual — hanya status configured / belum.
 */
export const GET = withAdmin(async () => {
    const secrets = [
        {
            key: "DATABASE_URL",
            configured: Boolean(env.DATABASE_URL),
            display: "Database",
        },
        {
            key: "REDIS_URL",
            configured: Boolean(env.REDIS_URL),
            display: "Redis / BullMQ Queue",
        },
        {
            key: "R2_ACCESS_KEY_ID",
            configured: Boolean(env.R2_ACCESS_KEY_ID),
            display: "Cloudflare R2 (S3 Storage)",
        },
        {
            key: "OPENROUTER_API_KEY",
            configured: Boolean(env.OPENROUTER_API_KEY),
            display: "OpenRouter API (Seb Advisor)",
        },
        {
            key: "NEXT_PUBLIC_SEB_ENABLED",
            configured: Boolean(process.env.NEXT_PUBLIC_SEB_ENABLED),
            display: "Seb (Feature Flag)",
        },
        {
            key: "SUMOPOD_API_KEY",
            configured: Boolean(env.SUMOPOD_API_KEY),
            display: "SumoPod (Payment Gateway)",
        },
        {
            key: "CRON_SECRET",
            configured: Boolean(env.CRON_SECRET),
            display: "Cron Secret",
        },
    ];

    const allConfigured = secrets.every((s) => s.configured);

    return json({
        allConfigured,
        configuredCount: secrets.filter((s) => s.configured).length,
        total: secrets.length,
        secrets,
    });
});
