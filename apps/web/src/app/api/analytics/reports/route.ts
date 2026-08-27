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
  const organizationId = searchParams.get("organizationId");
  const period = searchParams.get("period") || "30d";
  const format = searchParams.get("format") || "json";

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId wajib diisi." },
      { status: 400 },
    );
  }

  try {
    const summary = await client.getSummary(organizationId, period);

    if (format === "csv") {
      const csv = generateCSV(summary);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="report-${organizationId}-${period}.csv"`,
        },
      });
    }

    if (format === "pdf") {
      const html = generatePDFHTML(summary, period);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html",
          "Content-Disposition": `attachment; filename="report-${organizationId}-${period}.html"`,
        },
      });
    }

    return NextResponse.json({
      summary,
      generatedAt: new Date().toISOString(),
      period,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal generate report." },
      { status: 500 },
    );
  }
}

function generateCSV(data: {
  totalImpressions: number;
  totalReach: number;
  totalEngagement: number;
  avgEngagementRate: number;
  contentMix: {
    images: number;
    videos: number;
    carousels: number;
    reels: number;
    stories: number;
  };
}): string {
  const rows = [
    ["Metrik", "Nilai"],
    ["Total Tayangan", data.totalImpressions.toString()],
    ["Total Jangkauan", data.totalReach.toString()],
    ["Total Engagement", data.totalEngagement.toString()],
    ["Rata-rata Engagement Rate", `${data.avgEngagementRate}%`],
    [""],
    ["Content Mix", "Jumlah"],
    ["Gambar", data.contentMix.images.toString()],
    ["Video", data.contentMix.videos.toString()],
    ["Carousel", data.contentMix.carousels.toString()],
    ["Reels", data.contentMix.reels.toString()],
    ["Stories", data.contentMix.stories.toString()],
  ];

  return rows.map((row) => row.join(",")).join("\n");
}

function generatePDFHTML(
  data: {
    totalImpressions: number;
    totalReach: number;
    totalEngagement: number;
    avgEngagementRate: number;
    contentMix: {
      images: number;
      videos: number;
      carousels: number;
      reels: number;
      stories: number;
    };
  },
  period: string,
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Laporan Analitik - ${period}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
    .stat { background: #f8f9fa; padding: 20px; border-radius: 8px; }
    .stat-label { color: #666; font-size: 14px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #333; }
    .content-mix { margin-top: 30px; }
    .content-mix h2 { color: #333; }
    .mix-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
    .mix-item { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; }
    .mix-count { font-size: 20px; font-weight: bold; color: #007bff; }
    .mix-label { font-size: 12px; color: #666; }
    .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Laporan Analitik Media Sosial</h1>
  <p>Periode: ${period}</p>
  
  <div class="stats">
    <div class="stat">
      <div class="stat-label">Total Tayangan</div>
      <div class="stat-value">${data.totalImpressions.toLocaleString("id-ID")}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Jangkauan</div>
      <div class="stat-value">${data.totalReach.toLocaleString("id-ID")}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Engagement</div>
      <div class="stat-value">${data.totalEngagement.toLocaleString("id-ID")}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Rata-rata Engagement Rate</div>
      <div class="stat-value">${data.avgEngagementRate}%</div>
    </div>
  </div>
  
  <div class="content-mix">
    <h2>Konten yang Dipublikasikan</h2>
    <div class="mix-grid">
      <div class="mix-item">
        <div class="mix-count">${data.contentMix.images}</div>
        <div class="mix-label">Gambar</div>
      </div>
      <div class="mix-item">
        <div class="mix-count">${data.contentMix.videos}</div>
        <div class="mix-label">Video</div>
      </div>
      <div class="mix-item">
        <div class="mix-count">${data.contentMix.carousels}</div>
        <div class="mix-label">Carousel</div>
      </div>
      <div class="mix-item">
        <div class="mix-count">${data.contentMix.reels}</div>
        <div class="mix-label">Reels</div>
      </div>
      <div class="mix-item">
        <div class="mix-count">${data.contentMix.stories}</div>
        <div class="mix-label">Stories</div>
      </div>
    </div>
  </div>
  
  <div class="footer">
    <p>Digenerate oleh Sahabat Kreator pada ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}</p>
  </div>
</body>
</html>
  `.trim();
}
