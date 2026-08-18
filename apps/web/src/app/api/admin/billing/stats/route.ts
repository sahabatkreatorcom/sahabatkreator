import { NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { headers } from "next/headers";

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || session.user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = {
        totalRevenue: 15000000,
        mrr: 1200000,
        activeSubscriptions: 45,
        totalCustomers: 52,
        revenueThisMonth: 1200000,
        revenueGrowth: 12.5,
    };

    return NextResponse.json(stats);
}
