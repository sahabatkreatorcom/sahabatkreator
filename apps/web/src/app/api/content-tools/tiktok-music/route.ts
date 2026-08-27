import { env } from "@sahabat-kreator/env/server";
import { NextResponse } from "next/server";
import { TikTokMusicClient } from "@/lib/content-tools/tiktok-music";

function getClient() {
  if (!env.REPLIZ_ACCESS_KEY || !env.REPLIZ_SECRET_KEY) {
    return null;
  }
  return new TikTokMusicClient(
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
  const action = searchParams.get("action") || "trending";

  try {
    if (action === "trending") {
      const region = searchParams.get("region") || "ID";
      const limit = Number(searchParams.get("limit") || "20");
      const page = Number(searchParams.get("page") || "1");
      const result = await client.getTrendingMusic(region, limit, page);
      return NextResponse.json(result);
    }

    if (action === "search") {
      const query = searchParams.get("q");
      if (!query) {
        return NextResponse.json(
          { error: "q wajib diisi untuk pencarian." },
          { status: 400 },
        );
      }
      const region = searchParams.get("region") || "ID";
      const limit = Number(searchParams.get("limit") || "20");
      const result = await client.searchMusic(query, region, limit);
      return NextResponse.json(result);
    }

    if (action === "stats") {
      const musicId = searchParams.get("musicId");
      if (!musicId) {
        return NextResponse.json(
          { error: "musicId wajib diisi." },
          { status: 400 },
        );
      }
      const result = await client.getMusicUsageStats(musicId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "action tidak valid." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengambil data musik." },
      { status: 500 },
    );
  }
}
