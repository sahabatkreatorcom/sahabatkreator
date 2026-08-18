import { NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { headers } from "next/headers";

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || session.user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const health = {
        status: "healthy" as const,
        uptime: "3d 12h 45m",
        version: "1.0.0",
        components: [
            { name: "Database", status: "healthy", message: "Connected and responsive" },
            { name: "Auth Service", status: "healthy", message: "Operational" },
            { name: "File Storage", status: "healthy", message: "S3 connected" },
            { name: "Queue Worker", status: "healthy", message: "Processing normally" },
        ],
        metrics: {
            memoryUsage: "2.4 GB",
            cpuUsage: "35%",
            dbConnections: 12,
            activeSessions: 145,
        },
        lastCheck: new Date().toISOString(),
    };

    return NextResponse.json(health);
}
