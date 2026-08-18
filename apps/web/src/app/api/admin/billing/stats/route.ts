import { withAdmin, json } from "@/lib/api";

export const GET = withAdmin(async (ctx) => {
    const stats = {
        totalRevenue: 15000000,
        mrr: 1200000,
        activeSubscriptions: 45,
        totalCustomers: 52,
        revenueThisMonth: 1200000,
        revenueGrowth: 12.5,
    };

    return json(stats);
});
