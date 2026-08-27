import { env } from "@sahabat-kreator/env/server";
import { NextResponse } from "next/server";
import { LinkMetadataClient } from "@/lib/content-tools/link-metadata";

function getClient() {
  if (!env.REPLIZ_ACCESS_KEY || !env.REPLIZ_SECRET_KEY) {
    return null;
  }
  return new LinkMetadataClient(
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
  const action = searchParams.get("action") || "metadata";

  try {
    if (action === "metadata") {
      const url = searchParams.get("url");
      if (!url) {
        return NextResponse.json(
          { error: "url wajib diisi." },
          { status: 400 },
        );
      }
      const metadata = await client.getMetadata(url);
      return NextResponse.json(metadata);
    }

    if (action === "batch") {
      const urls = searchParams.get("urls");
      if (!urls) {
        return NextResponse.json(
          { error: "urls wajib diisi (pisahkan koma)." },
          { status: 400 },
        );
      }
      const urlList = urls
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
      const metadata = await client.getMultipleMetadata(urlList);
      return NextResponse.json({ metadata });
    }

    if (action === "preview") {
      const url = searchParams.get("url");
      if (!url) {
        return NextResponse.json(
          { error: "url wajib diisi." },
          { status: 400 },
        );
      }
      const result = await client.generatePreviewCard(url);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "action tidak valid." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengambil metadata." },
      { status: 500 },
    );
  }
}
