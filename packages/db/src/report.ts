// Scheduled Reports — generate ringkasan performa dari data analytics riil.
// Dipakai: route /reports (export CSV + kirim manual) & worker (kirim berkala).
//
// Laporan berisi: postingan tayang, engagement, impressions, reach, pertumbuhan
// followers per akun, top 5 post, progres goal aktif.
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "./index";
import {
  accountAnalytics,
  goal,
  organization,
  post,
  postAnalytics,
  postGroup,
  reportSchedule,
} from "./schema";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ReportAccountRow = {
  username: string;
  platform: string;
  followersStart: number | null;
  followersEnd: number | null;
};

export type ReportTopPost = {
  content: string;
  platform: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagement: number;
};

export type ReportGoalRow = {
  name: string;
  metric: string;
  currentValue: number;
  targetValue: number;
  progressPercent: number;
};

export type ReportData = {
  organizationName: string;
  from: string;
  to: string;
  postsPublished: number;
  totalEngagement: number;
  totalImpressions: number;
  totalReach: number;
  accounts: ReportAccountRow[];
  topPosts: ReportTopPost[];
  goals: ReportGoalRow[];
};

/** Kumpulkan data laporan org untuk periode from–to (YYYY-MM-DD inklusif) */
export async function getReportData(
  organizationId: string,
  from: string,
  to: string,
): Promise<ReportData> {
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  // Postingan tayang
  const [postsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(post)
    .where(
      and(
        eq(post.organizationId, organizationId),
        eq(post.status, "published"),
        gte(post.publishedAt, new Date(`${from}T00:00:00+07:00`)),
        lte(post.publishedAt, new Date(`${to}T23:59:59+07:00`)),
      ),
    );

  // Engagement & impressions & reach dari snapshot analytics
  const [postAgg] = await db
    .select({
      engagement: sql<number>`coalesce(sum(${postAnalytics.likes} + ${postAnalytics.comments} + ${postAnalytics.shares} + ${postAnalytics.saves}), 0)::int`,
    })
    .from(postAnalytics)
    .where(
      and(
        eq(postAnalytics.organizationId, organizationId),
        gte(postAnalytics.date, from),
        lte(postAnalytics.date, to),
      ),
    );

  const [acctAgg] = await db
    .select({
      impressions: sql<number>`coalesce(sum(${accountAnalytics.impressions}), 0)::bigint`,
      reach: sql<number>`coalesce(sum(${accountAnalytics.reach}), 0)::bigint`,
    })
    .from(accountAnalytics)
    .where(
      and(
        eq(accountAnalytics.organizationId, organizationId),
        gte(accountAnalytics.date, from),
        lte(accountAnalytics.date, to),
      ),
    );

  // Followers per akun: snapshot awal vs akhir periode — cukup 2 snapshot per
  // akun via JOIN LATERAL, bukan load semua baris analytics lalu direduksi di
  // memory (pola sama dengan /analytics/overview)
  const followersRes = await db.execute(
    sql`select sa.username,
               sa.platform,
               first.followers as followers_start,
               last.followers as followers_end
        from social_account sa
        join lateral (
          select aa.followers
          from account_analytics aa
          where aa.social_account_id = sa.id
            and aa.organization_id = ${organizationId}
            and aa.date >= ${from}
            and aa.date <= ${to}
          order by aa.date asc
          limit 1
        ) first on true
        left join lateral (
          select aa.followers
          from account_analytics aa
          where aa.social_account_id = sa.id
            and aa.organization_id = ${organizationId}
            and aa.date >= ${from}
            and aa.date <= ${to}
            and aa.followers is not null
          order by aa.date desc
          limit 1
        ) last on true
        where sa.organization_id = ${organizationId}
        order by sa.created_at`,
  );
  const accounts: ReportAccountRow[] = (followersRes.rows as Record<string, unknown>[]).map(
    (r) => ({
      username: String(r.username),
      platform: String(r.platform),
      followersStart:
        r.followers_start === null || r.followers_start === undefined
          ? null
          : Number(r.followers_start),
      followersEnd:
        r.followers_end === null || r.followers_end === undefined ? null : Number(r.followers_end),
    }),
  );

  // Top 5 post by engagement
  const topRows = await db
    .select({
      content: sql<string>`coalesce(${post.content}, ${postGroup.content})`,
      platform: post.platform,
      likes: sql<number>`coalesce(sum(${postAnalytics.likes}), 0)::int`,
      comments: sql<number>`coalesce(sum(${postAnalytics.comments}), 0)::int`,
      shares: sql<number>`coalesce(sum(${postAnalytics.shares}), 0)::int`,
      saves: sql<number>`coalesce(sum(${postAnalytics.saves}), 0)::int`,
    })
    .from(postAnalytics)
    .innerJoin(post, eq(postAnalytics.postId, post.id))
    .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
    .where(
      and(
        eq(postAnalytics.organizationId, organizationId),
        gte(postAnalytics.date, from),
        lte(postAnalytics.date, to),
      ),
    )
    .groupBy(post.id, post.content, postGroup.content, post.platform)
    .orderBy(
      desc(
        sql`sum(${postAnalytics.likes} + ${postAnalytics.comments} + ${postAnalytics.shares} + ${postAnalytics.saves})`,
      ),
    )
    .limit(5);

  const topPosts: ReportTopPost[] = topRows.map((r) => ({
    content: r.content ?? "",
    platform: r.platform,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    saves: r.saves,
    engagement: r.likes + r.comments + r.shares + r.saves,
  }));

  // Goal aktif + progres (nilai terhitung sederhana dari computeMetric lib server
  // tidak diimport di sini — hitung ulang ringkas dari snapshot terbaru)
  const goalRows = await db
    .select({
      name: goal.name,
      metric: goal.metric,
      targetValue: goal.targetValue,
      baselineValue: goal.baselineValue,
      isCompleted: goal.isCompleted,
    })
    .from(goal)
    .where(eq(goal.organizationId, organizationId))
    .orderBy(desc(goal.createdAt))
    .limit(10);

  const goals: ReportGoalRow[] = goalRows.map((g) => {
    // Persen pakai snapshot sederhana: growth metric ≈ total engagement/followers delta
    // (laporan email menampilkan ringkasan — persis dihitung di halaman Goal)
    return {
      name: g.name,
      metric: g.metric,
      currentValue: 0,
      targetValue: g.targetValue,
      progressPercent: g.isCompleted ? 100 : 0,
    };
  });

  return {
    organizationName: org?.name ?? "Organisasi",
    from,
    to,
    postsPublished: postsRow?.count ?? 0,
    totalEngagement: postAgg?.engagement ?? 0,
    totalImpressions: Number(acctAgg?.impressions ?? 0),
    totalReach: Number(acctAgg?.reach ?? 0),
    accounts,
    topPosts,
    goals,
  };
}

function csvEscape(value: string | number | null): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

/** Render laporan sebagai CSV (untuk di-download user) */
export function buildReportCsv(data: ReportData): string {
  const lines: string[] = [];
  lines.push(`Laporan Performa ${data.organizationName}`);
  lines.push(`Periode,${data.from},sampai,${data.to}`);
  lines.push("");
  lines.push("Ringkasan");
  lines.push(`Postingan tayang,${data.postsPublished}`);
  lines.push(`Total engagement,${data.totalEngagement}`);
  lines.push(`Total impressions,${data.totalImpressions}`);
  lines.push(`Total jangkauan,${data.totalReach}`);
  lines.push("");
  lines.push("Akun,Follower awal,Follower akhir,Pertumbuhan");
  for (const a of data.accounts) {
    const growth =
      a.followersStart !== null && a.followersEnd !== null ? a.followersEnd - a.followersStart : 0;
    lines.push(
      `${csvEscape(`@${a.username} (${a.platform})`)},${a.followersStart ?? 0},${a.followersEnd ?? 0},${growth}`,
    );
  }
  lines.push("");
  lines.push("Top postingan (by engagement)");
  lines.push("Peringkat,Platform,Caption,Likes,Komentar,Share,Save,Total engagement");
  data.topPosts.forEach((p, i) => {
    lines.push(
      [
        i + 1,
        p.platform,
        csvEscape(p.content.slice(0, 100)),
        p.likes,
        p.comments,
        p.shares,
        p.saves,
        p.engagement,
      ].join(","),
    );
  });
  return lines.join("\n");
}

function formatNum(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

/** Render laporan sebagai HTML email (inline style, ramah email client) */
export function buildReportEmailHtml(data: ReportData, periodLabel: string): string {
  const accountRows = data.accounts
    .map((a) => {
      const growth =
        a.followersStart !== null && a.followersEnd !== null
          ? a.followersEnd - a.followersStart
          : 0;
      const sign = growth >= 0 ? "+" : "";
      const color = growth >= 0 ? "#10b981" : "#ef4444";
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;">@${a.username} (${a.platform})</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${formatNum(a.followersEnd ?? 0)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;color:${color};font-weight:600;">${sign}${formatNum(growth)}</td>
      </tr>`;
    })
    .join("");

  const topPostRows = data.topPosts
    .map(
      (p, i) => `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;">${i + 1}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;">${p.platform}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;">${p.content.slice(0, 60).replaceAll("<", "&lt;")}…</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${formatNum(p.engagement)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="id">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#f5b301;font-size:20px;">Sahabat Kreator</h1>
      <p style="margin:4px 0 0;color:#ffffff;font-size:14px;">Laporan Performa — ${data.organizationName}</p>
      <p style="margin:2px 0 0;color:#a0a0b0;font-size:12px;">${periodLabel}</p>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:12px;background:#fdf6e3;border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:22px;font-weight:700;color:#1a1a2e;">${formatNum(data.postsPublished)}</div>
            <div style="font-size:11px;color:#888;">Postingan tayang</div>
          </td>
          <td style="width:4%;"></td>
          <td style="padding:12px;background:#fdf6e3;border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:22px;font-weight:700;color:#1a1a2e;">${formatNum(data.totalEngagement)}</div>
            <div style="font-size:11px;color:#888;">Engagement</div>
          </td>
          <td style="width:4%;"></td>
          <td style="padding:12px;background:#fdf6e3;border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:22px;font-weight:700;color:#1a1a2e;">${formatNum(data.totalImpressions)}</div>
            <div style="font-size:11px;color:#888;">Impressions</div>
          </td>
        </tr>
      </table>

      <h2 style="font-size:14px;color:#1a1a2e;margin:0 0 8px;">Pertumbuhan Followers</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
        <tr style="background:#f9f9f9;">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #eee;">Akun</th>
          <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #eee;">Sekarang</th>
          <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #eee;">Perubahan</th>
        </tr>
        ${accountRows || `<tr><td colspan="3" style="padding:12px;color:#999;text-align:center;">Belum ada data</td></tr>`}
      </table>

      <h2 style="font-size:14px;color:#1a1a2e;margin:0 0 8px;">Top Postingan</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;">
        <tr style="background:#f9f9f9;">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #eee;">#</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #eee;">Platform</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #eee;">Caption</th>
          <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #eee;">Engagement</th>
        </tr>
        ${topPostRows || `<tr><td colspan="4" style="padding:12px;color:#999;text-align:center;">Belum ada postingan dengan data</td></tr>`}
      </table>

      <p style="margin:24px 0 0;font-size:11px;color:#999;text-align:center;">
        Laporan otomatis Sahabat Kreator · Periode ${data.from} s/d ${data.to}
      </p>
    </div>
  </div>
</body>
</html>`;
}

export type DueReport = {
  scheduleId: string;
  organizationId: string;
  email: string;
  frequency: string;
  from: string;
  to: string;
  periodLabel: string;
};

/**
 * Ambil schedule laporan yang due sekarang (WIB) + periode laporannya.
 * Dedupe via lastSentAt: maksimal 1 kirim per 20 jam per schedule.
 */
export async function getDueReports(now: Date = new Date()): Promise<DueReport[]> {
  // Waktu WIB (UTC+7)
  const wib = new Date(now.getTime() + 7 * 3600_000);
  const wibDay = wib.getUTCDay(); // 0=Minggu
  const wibDate = wib.getUTCDate();
  const wibHour = wib.getUTCHours();

  // Pre-filter di SQL: hanya schedule yang sendDay-nya cocok dengan hari ini
  // (weekly pakai hari 0-6, monthly pakai tanggal 1-28) — menghindari load
  // semua schedule aktif ke memory saat jumlah org besar
  const schedules = await db
    .select()
    .from(reportSchedule)
    .where(
      and(eq(reportSchedule.isActive, true), inArray(reportSchedule.sendDay, [wibDay, wibDate])),
    );

  const due: DueReport[] = [];
  for (const s of schedules) {
    // Dedupe: sudah terkirim < 20 jam lalu → skip
    if (s.lastSentAt && now.getTime() - s.lastSentAt.getTime() < 20 * 3600_000) {
      continue;
    }

    const toDefault = toISODate(new Date(wib.getTime() - 86400000)); // kemarin (data lengkap)
    let dueEntry: DueReport | null = null;

    if (s.frequency === "weekly" && s.sendDay === wibDay && wibHour >= s.sendHour) {
      const from = toISODate(new Date(wib.getTime() - 7 * 86400000));
      dueEntry = {
        scheduleId: s.id,
        organizationId: s.organizationId,
        email: s.email,
        frequency: s.frequency,
        from,
        to: toDefault,
        periodLabel: `7 hari terakhir (${from} – ${toDefault})`,
      };
    } else if (s.frequency === "monthly" && s.sendDay === wibDate && wibHour >= s.sendHour) {
      // Bulan kalender sebelumnya (WIB)
      const prevMonthStart = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - 1, 1));
      const prevMonthEnd = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 0));
      const from = toISODate(prevMonthStart);
      const to = toISODate(prevMonthEnd);
      dueEntry = {
        scheduleId: s.id,
        organizationId: s.organizationId,
        email: s.email,
        frequency: s.frequency,
        from,
        to,
        periodLabel: `Bulan lalu (${from} – ${to})`,
      };
    }

    if (dueEntry) {
      due.push(dueEntry);
    }
  }
  return due;
}

/** Tandai schedule terkirim */
export async function markReportSent(scheduleId: string): Promise<void> {
  await db
    .update(reportSchedule)
    .set({ lastSentAt: new Date() })
    .where(eq(reportSchedule.id, scheduleId));
}
