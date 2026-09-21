// Export PDF branded — tanpa dependency baru (bukan jsPDF, demi bundle size).
// Pendekatan: buka window baru berisi HTML laporan terstruktur (header logo +
// nama org + periode, tabel metrik, top posts) lalu otomatis membuka print
// dialog — user memilih "Simpan sebagai PDF" di tujuan printer.
// Data yang dipakai sama dengan export CSV (/reports/summary → getReportData).

/** Bentuk data laporan — subset ReportData dari /reports/summary */
export type PdfReportData = {
  organizationName: string;
  from: string;
  to: string;
  postsPublished: number;
  totalEngagement: number;
  totalImpressions: number;
  totalReach: number;
  accounts: {
    username: string;
    platform: string;
    followersStart: number | null;
    followersEnd: number | null;
  }[];
  topPosts: {
    content: string;
    platform: string;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagement: number;
  }[];
};

function formatNum(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

/** Bangun dokumen HTML laporan branded Sahabat Kreator (siap print → PDF) */
export function generatePdfReport(data: PdfReportData): void {
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) {
    throw new Error("Popup diblokir browser — izinkan popup untuk situs ini lalu coba lagi.");
  }

  const accountRows = data.accounts
    .map((a) => {
      const growth =
        a.followersStart !== null && a.followersEnd !== null
          ? a.followersEnd - a.followersStart
          : 0;
      const sign = growth >= 0 ? "+" : "";
      const color = growth >= 0 ? "#10b981" : "#ef4444";
      return `<tr><td>@${escapeHtml(a.username)} <span class="muted">(${escapeHtml(a.platform)})</span></td><td class="num">${formatNum(a.followersStart ?? 0)}</td><td class="num">${formatNum(a.followersEnd ?? 0)}</td><td class="num" style="color:${color};font-weight:600;">${sign}${formatNum(growth)}</td></tr>`;
    })
    .join("");

  const topPostRows = data.topPosts
    .map(
      (p, i) =>
        `<tr><td class="num">${i + 1}</td><td>${escapeHtml(p.platform)}</td><td>${escapeHtml(p.content.slice(0, 80) || "(tanpa caption)")}</td><td class="num">${formatNum(p.engagement)}</td></tr>`,
    )
    .join("");

  win.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Laporan Performa ${escapeHtml(data.organizationName)} — Sahabat Kreator</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 48px; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a2e; font-size: 13px; line-height: 1.5; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid #08a5fc; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 44px; height: 44px; border-radius: 10px; }
  .brand-name { font-size: 20px; font-weight: 800; color: #08a5fc; }
  .brand-sub { font-size: 12px; color: #6b7280; }
  .period { text-align: right; }
  .period-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; }
  .period-value { font-size: 14px; font-weight: 600; }
  .metrics { display: flex; gap: 12px; margin-bottom: 28px; }
  .metric { flex: 1; background: #e8f5fe; border-radius: 10px; padding: 14px; text-align: center; }
  .metric-value { font-size: 22px; font-weight: 700; }
  .metric-label { font-size: 11px; color: #6b7280; margin-top: 2px; }
  h2 { font-size: 14px; margin: 24px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 8px 10px; background: #f5f0ec; border-bottom: 2px solid #e5e0db; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  .num { text-align: right; }
  th.num { text-align: right; }
  .muted { color: #9ca3af; }
  .empty { color: #9ca3af; text-align: center; padding: 16px; }
  .footer { margin-top: 36px; border-top: 1px solid #e5e0db; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
  .hint { background: #fff8e6; border: 1px solid #f5d978; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; }
  @media print { .hint { display: none; } body { padding: 24px; } }
</style>
</head>
<body>
  <div class="hint">
    <strong>Simpan sebagai PDF:</strong> pada dialog cetak, pilih tujuan
    <em>"Save as PDF"</em> / <em>"Simpan sebagai PDF"</em>, lalu klik Simpan.
  </div>

  <div class="header">
    <div class="brand">
      <img src="/logo-sahabat-kreator-baru.png" alt="Logo Sahabat Kreator" />
      <div>
        <div class="brand-name">Sahabat Kreator</div>
        <div class="brand-sub">Laporan Performa — ${escapeHtml(data.organizationName)}</div>
      </div>
    </div>
    <div class="period">
      <div class="period-label">Periode</div>
      <div class="period-value">${formatDateLabel(data.from)} – ${formatDateLabel(data.to)}</div>
    </div>
  </div>

  <div class="metrics">
    <div class="metric"><div class="metric-value">${formatNum(data.postsPublished)}</div><div class="metric-label">Postingan Tayang</div></div>
    <div class="metric"><div class="metric-value">${formatNum(data.totalEngagement)}</div><div class="metric-label">Total Engagement</div></div>
    <div class="metric"><div class="metric-value">${formatNum(data.totalImpressions)}</div><div class="metric-label">Total Impressions</div></div>
    <div class="metric"><div class="metric-value">${formatNum(data.totalReach)}</div><div class="metric-label">Jangkauan (Reach)</div></div>
  </div>

  <h2>Pertumbuhan Followers</h2>
  <table>
    <thead><tr><th>Akun</th><th class="num">Awal</th><th class="num">Akhir</th><th class="num">Perubahan</th></tr></thead>
    <tbody>${accountRows || '<tr><td colspan="4" class="empty">Belum ada data analytics akun dalam periode ini</td></tr>'}</tbody>
  </table>

  <h2>Top Postingan (by engagement)</h2>
  <table>
    <thead><tr><th>#</th><th>Platform</th><th>Caption</th><th class="num">Engagement</th></tr></thead>
    <tbody>${topPostRows || '<tr><td colspan="4" class="empty">Belum ada postingan dengan data engagement dalam periode ini</td></tr>'}</tbody>
  </table>

  <div class="footer">
    <span>Dibuat dengan Sahabat Kreator — sahabatkreator.id</span>
    <span>${formatDateLabel(data.to)}</span>
  </div>

  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}
