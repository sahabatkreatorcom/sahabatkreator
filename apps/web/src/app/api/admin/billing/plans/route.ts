import { NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { headers } from "next/headers";

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || session.user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const plans = [
        { name: "Free", price: 0, subscribers: 120, revenue: 0 },
        { name: "Starter", price: 50000, subscribers: 45, revenue: 2250000 },
        { name: "Professional", price: 150000, subscribers: 28, revenue: 4200000 },
        { name: "Enterprise", price: 500000, subscribers: 5, revenue: 2500000 },
    ];

    return NextResponse.json({ plans });
}
