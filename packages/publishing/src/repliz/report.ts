// Report API (Gold+) — log eksekusi automation (reply/delete/like/message/chat/story).
// Docs: docs/repliz/Report/

import { replizEmpty, replizRequest, type ReplizCredentials } from "./shared";

export type ReplizReportType = "delete" | "reply" | "like" | "message" | "chat" | "story";
export type ReplizReportStatus = "error" | "success";

/**
 * Satu report eksekusi automation (GET /public/report).
 * `value` berisi konteks eksekusi — bentuknya bervariasi per type (mis. reply
 * berisi comment + reply-nya). Dibiarkan longgar (Record) karena setiap type
 * punya shape berbeda dan docs tidak mendefinisikan union lengkap.
 */
export type ReplizReport = {
  _id: string;
  type: ReplizReportType;
  status?: ReplizReportStatus;
  accountId?: string;
  value: Record<string, unknown>;
  createdAt?: string;
};

/**
 * List report eksekusi automation (GET /public/report).
 * Filter account WAJIB notasi array `accountIds[]` (sama pola dgn endpoint
 * list lain — bentuk tunggal diabaikan API).
 */
export async function replizListReports(
  cred: ReplizCredentials,
  opts: {
    page?: number;
    limit?: number;
    type?: ReplizReportType;
    status?: ReplizReportStatus;
    accountId?: string;
    search?: string;
  } = {},
): Promise<{
  docs: ReplizReport[];
  totalDocs?: number;
  hasNextPage?: boolean;
  nextPage?: number | null;
}> {
  const query: Record<string, string | string[]> = {
    page: String(opts.page ?? 1),
    limit: String(opts.limit ?? 20),
  };
  if (opts.type) query.type = opts.type;
  if (opts.status) query.status = opts.status;
  if (opts.accountId) query["accountIds[]"] = opts.accountId;
  if (opts.search) query.search = opts.search;

  const data = await replizRequest<{
    docs: Array<Record<string, unknown>>;
    totalDocs?: number;
    hasNextPage?: boolean;
    nextPage?: number | null;
  }>(cred, "/public/report", { query });

  return {
    docs: (data?.docs ?? []).map((d) => ({
      _id: String(d._id ?? d.id),
      type: String(d.type ?? "") as ReplizReportType,
      status: d.status as ReplizReportStatus | undefined,
      accountId: d.accountId ? String(d.accountId) : undefined,
      value: (d.value ?? {}) as Record<string, unknown>,
      createdAt: d.createdAt ? String(d.createdAt) : undefined,
    })),
    totalDocs: data?.totalDocs,
    hasNextPage: data?.hasNextPage,
    nextPage: data?.nextPage ?? null,
  };
}

/** Ambil satu report by id (GET /public/report/{reportId}). */
export async function replizGetOneReport(
  cred: ReplizCredentials,
  reportId: string,
): Promise<ReplizReport | null> {
  const data = await replizRequest<Record<string, unknown>>(cred, `/public/report/${reportId}`);
  if (!data || (!data._id && !data.id)) return null;
  return {
    _id: String(data._id ?? data.id),
    type: String(data.type ?? "") as ReplizReportType,
    status: data.status as ReplizReportStatus | undefined,
    accountId: data.accountId ? String(data.accountId) : undefined,
    value: (data.value ?? {}) as Record<string, unknown>,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
  };
}

/** Jalankan ulang report yang gagal (PUT /public/report/{reportId}/retry, 204). */
export async function replizRetryReport(cred: ReplizCredentials, reportId: string): Promise<void> {
  await replizEmpty(cred, `/public/report/${reportId}/retry`, { method: "PUT", body: {} });
}
