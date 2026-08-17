import { NextRequest } from "next/server";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/health — ping untuk healthcheck/uptime. */
export const GET = async (_req: NextRequest) => {
    return json({ ok: true, ts: new Date().toISOString() });
};