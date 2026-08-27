import { env } from "@sahabat-kreator/env/server";
import { NextResponse } from "next/server";
import { ShopeeClient } from "@/lib/content-tools/shopee";

function getClient() {
  if (!env.REPLIZ_ACCESS_KEY || !env.REPLIZ_SECRET_KEY) {
    return null;
  }
  return new ShopeeClient(
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
  const action = searchParams.get("action") || "search";

  try {
    if (action === "search") {
      const query = searchParams.get("q");
      if (!query) {
        return NextResponse.json(
          { error: "q wajib diisi untuk pencarian." },
          { status: 400 },
        );
      }
      const limit = Number(searchParams.get("limit") || "20");
      const page = Number(searchParams.get("page") || "1");
      const sort = searchParams.get("sort") as
        | "relevancy"
        | "sales"
        | "price_asc"
        | "price_desc"
        | undefined;
      const result = await client.searchProducts(query, limit, page, sort);
      return NextResponse.json(result);
    }

    if (action === "flash-sale") {
      const limit = Number(searchParams.get("limit") || "20");
      const products = await client.getFlashSale(limit);
      return NextResponse.json({ products });
    }

    if (action === "daily-discover") {
      const limit = Number(searchParams.get("limit") || "20");
      const products = await client.getDailyDiscover(limit);
      return NextResponse.json({ products });
    }

    if (action === "product") {
      const itemId = searchParams.get("itemId");
      const shopId = searchParams.get("shopId") || undefined;
      if (!itemId) {
        return NextResponse.json(
          { error: "itemId wajib diisi." },
          { status: 400 },
        );
      }
      const product = await client.getProduct(itemId, shopId);
      return NextResponse.json(product);
    }

    if (action === "affiliate-stats") {
      const startDate = searchParams.get("startDate");
      const endDate = searchParams.get("endDate");
      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: "startDate dan endDate wajib diisi." },
          { status: 400 },
        );
      }
      const stats = await client.getAffiliateStats(startDate, endDate);
      return NextResponse.json(stats);
    }

    return NextResponse.json({ error: "action tidak valid." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Gagal mengambil data Shopee.",
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
    const { productUrl, campaignId } = body;

    if (!productUrl) {
      return NextResponse.json(
        { error: "productUrl wajib diisi." },
        { status: 400 },
      );
    }

    const result = await client.generateAffiliateLink(productUrl, campaignId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Gagal membuat affiliate link.",
      },
      { status: 500 },
    );
  }
}
