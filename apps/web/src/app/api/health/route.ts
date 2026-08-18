import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@sahabat-kreator/db";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/health — readiness check: verifikasi koneksi database. */
export const GET = async (_req: NextRequest) => {
    try {
        await db.execute(sql`select 1`);
        return json({ ok: true, db: true, ts: new Date().toISOString() });
    } catch {
        return json({ ok: false, db: false, ts: new Date().toISOString() }, { status: 503 });
    }
};
