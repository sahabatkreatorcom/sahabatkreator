import { env } from "@sahabat-kreator/env/server";
import { NextResponse } from "next/server";
import { ContentAnalyticsClient } from "@/lib/content-tools/analytics";

function getClient() {
  if (!env.REPLIZ_ACCESS_KEY || !env.REPLIZ_SECRET_KEY) {
    return null;
  }
  return new ContentAnalyticsClient(
    env.REPLIZ_ACCESS_KEY,
    env.REPLIZ_SECRET_KEY,
    env.REPLIZ_API_URL,
  );
}

export async function GET(request: Request) {
  const client = getClient();
  if (!client) {
    return NextResponse.json(
      { error: "Repliz belum dikonfigurasi." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "summary";

  try {
    if (action === "summary") {
      const organizationId = searchParams.get("organizationId");
      if (!organizationId) {
        return NextResponse.json(
          { error: "organizationId wajib diisi." },
          { status: 400 },
        );
      }
      const period = searchParams.get("period") || "30d";
      const summary = await client.getSummary(organizationId, period);
      return NextResponse.json(summary);
    }

    if (action === "post") {
      const postId = searchParams.get("postId");
      const platform = searchParams.get("platform");
      if (!postId || !platform) {
        return NextResponse.json(
          { error: "postId dan platform wajib diisi." },
          { status: 400 },
        );
      }
      const analytics = await client.getPostAnalytics(postId, platform);
      return NextResponse.json(analytics);
    }

    if (action === "account") {
      const accountId = searchParams.get("accountId");
      const platform = searchParams.get("platform");
      if (!accountId || !platform) {
        return NextResponse.json(
          { error: "accountId dan platform wajib diisi." },
          { status: 400 },
        );
      }
      const period = searchParams.get("period") || "30d";
      const analytics = await client.getAccountAnalytics(
        accountId,
        platform,
        period,
      );
      return NextResponse.json(analytics);
    }

    if (action === "best-times") {
      const accountId = searchParams.get("accountId");
      const platform = searchParams.get("platform");
      if (!accountId || !platform) {
        return NextResponse.json(
          { error: "accountId dan platform wajib diisi." },
          { status: 400 },
        );
      }
      const bestTimes = await client.getBestPostingTimes(accountId, platform);
      return NextResponse.json(bestTimes);
    }

    if (action === "compare") {
      const accountId = searchParams.get("accountId");
      const platform = searchParams.get("platform");
      const period1 = searchParams.get("period1");
      const period2 = searchParams.get("period2");
      if (!accountId || !platform || !period1 || !period2) {
        return NextResponse.json(
          { error: "accountId, platform, period1, dan period2 wajib diisi." },
          { status: 400 },
        );
      }
      const comparison = await client.getPerformanceComparison(
        accountId,
        platform,
        period1,
        period2,
      );
      return NextResponse.json(comparison);
    }

    return NextResponse.json({ error: "action tidak valid." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengambil analytics." },
      { status: 500 },
    );
  }
}
