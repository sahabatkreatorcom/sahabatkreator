import { sql } from "drizzle-orm";
import { db } from "@sahabat-kreator/db";
import { withAdmin, json } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async (ctx) => {
    const mem = process.memoryUsage();
    const started = Date.now();
    let dbStatus = "unhealthy";
    try {
        await db.execute(sql`select 1`);
        dbStatus = "healthy";
    } catch {
        dbStatus = "unhealthy";
    }
    const dbMs = Date.now() - started;

    const health = {
        status: dbStatus === "healthy" ? ("healthy" as const) : ("degraded" as const),
        uptimeSeconds: Math.floor(process.uptime()),
        version: process.env.npm_package_version || "dev",
        nodeVersion: process.version,
        components: [
            { name: "Database", status: dbStatus, message: `${dbMs}ms` },
            { name: "Auth Service", status: "healthy", message: "Operational" },
        ],
        metrics: {
            memoryRssMb: Math.round(mem.rss / 1024 / 1024),
            memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
            cpuTimeMs: process.cpuUsage().user / 1000,
        },
        lastCheck: new Date().toISOString(),
    };

    const status = dbStatus === "healthy" ? 200 : 503;
    return json(health, { status });
});
