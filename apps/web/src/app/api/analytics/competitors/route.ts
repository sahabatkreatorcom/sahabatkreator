import { env } from "@sahabat-kreator/env/server";
import { NextResponse } from "next/server";

const DEFAULT_REPLIZ_URL = "https://api.repliz.com";

interface CompetitorData {
  username: string;
  platform: string;
  followers: number;
  followersGrowth: number;
  engagementRate: number;
  avgLikes: number;
  avgComments: number;
  avgViews: number;
  postFrequency: number;
  topContent: Array<{
    id: string;
    text: string;
    likes: number;
    comments: number;
    views: number;
    postedAt: string;
  }>;
}

function getClient() {
  if (!env.REPLIZ_ACCESS_KEY || !env.REPLIZ_SECRET_KEY) {
    return null;
  }
  const token = Buffer.from(
    `${env.REPLIZ_ACCESS_KEY}:${env.REPLIZ_SECRET_KEY}`,
  ).toString("base64");
  return {
    baseUrl: env.REPLIZ_API_URL || DEFAULT_REPLIZ_URL,
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
  };
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
  const action = searchParams.get("action") || "list";

  try {
    if (action === "list") {
      const orgId = searchParams.get("organizationId");
      if (!orgId) {
        return NextResponse.json(
          { error: "organizationId wajib diisi." },
          { status: 400 },
        );
      }

      const res = await fetch(
        `${client.baseUrl}/v1/analytics/competitors?organization_id=${orgId}`,
        { headers: client.headers },
      );
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "analyze") {
      const username = searchParams.get("username");
      const platform = searchParams.get("platform");
      if (!username || !platform) {
        return NextResponse.json(
          { error: "username dan platform wajib diisi." },
          { status: 400 },
        );
      }

      const res = await fetch(
        `${client.baseUrl}/v1/analytics/competitors/analyze?username=${encodeURIComponent(username)}&platform=${platform}`,
        { headers: client.headers },
      );
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "compare") {
      const orgId = searchParams.get("organizationId");
      const competitorIds = searchParams.get("competitorIds");
      if (!orgId || !competitorIds) {
        return NextResponse.json(
          { error: "organizationId dan competitorIds wajib diisi." },
          { status: 400 },
        );
      }

      const res = await fetch(
        `${client.baseUrl}/v1/analytics/competitors/compare?organization_id=${orgId}&competitor_ids=${competitorIds}`,
        { headers: client.headers },
      );
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "action tidak valid." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Gagal mengambil data competitor.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const client = getClient();
  if (!client) {
    return NextResponse.json(
      { error: "Repliz belum dikonfigurasi." },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const { organizationId, username, platform, notes } = body;

    if (!organizationId || !username || !platform) {
      return NextResponse.json(
        { error: "organizationId, username, dan platform wajib diisi." },
        { status: 400 },
      );
    }

    const res = await fetch(`${client.baseUrl}/v1/analytics/competitors`, {
      method: "POST",
      headers: client.headers,
      body: JSON.stringify({
        organization_id: organizationId,
        username,
        platform,
        notes,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || "Gagal menambah competitor." },
        { status: 400 },
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menambah competitor." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const client = getClient();
  if (!client) {
    return NextResponse.json(
      { error: "Repliz belum dikonfigurasi." },
      { status: 503 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get("competitorId");

    if (!competitorId) {
      return NextResponse.json(
        { error: "competitorId wajib diisi." },
        { status: 400 },
      );
    }

    const res = await fetch(
      `${client.baseUrl}/v1/analytics/competitors/${competitorId}`,
      { method: "DELETE", headers: client.headers },
    );

    if (!res.ok) {
      const data = await res.json();
      return NextResponse.json(
        { error: data.message || "Gagal menghapus competitor." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menghapus competitor." },
      { status: 500 },
    );
  }
}
