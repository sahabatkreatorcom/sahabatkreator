import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@sahabat-kreator/db";
import { json } from "@/lib/api";
import { checkRedisHealth } from "@sahabat-kreator/queue";

export const dynamic = "force-dynamic";

/** GET /api/health — readiness check: DB + Redis + queue status. */
export const GET = async (_req: NextRequest) => {
    const dbOk = await checkDb();
    const redisOk = await checkRedis();
    const ready = dbOk && redisOk;

    return json(
        {
            ok: ready,
            db: dbOk,
            redis: redisOk,
            ts: new Date().toISOString(),
        },
        { status: ready ? 200 : 503 },
    );
};

async function checkDb(): Promise<boolean> {
    try {
        await db.execute(sql`select 1`);
        return true;
    } catch {
        return false;
    }
}

async function checkRedis(): Promise<boolean> {
    return checkRedisHealth();
}

