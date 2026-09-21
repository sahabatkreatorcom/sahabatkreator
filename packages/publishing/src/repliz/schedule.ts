// Schedule API (Premium+) — create, getOne, list, update, retry, remove, mass.
// Docs: docs/repliz/Schedule/

import { replizEmpty, replizMissingId, replizRequest, type ReplizCredentials } from "./shared";
import { PublishError } from "../types";

/** Status schedule Repliz: pending → process → success | error */
export type ReplizScheduleStatus = "pending" | "process" | "error" | "success";

export type ReplizSchedule = {
  id: string;
  status: ReplizScheduleStatus;
  /** Post ID asli platform (terisi setelah success) */
  postId?: string;
  scheduleAt: string;
  type: string;
  accountId: string;
};

/** Media untuk createSchedule */
export type ReplizMedia = {
  alt?: string;
  type: "image" | "video";
  thumbnail?: string;
  url: string;
};

export type ReplizScheduleInput = {
  title?: string;
  description: string;
  type: "text" | "image" | "video" | "reel" | "album" | "link" | "story";
  medias: ReplizMedia[];
  accountId: string;
  scheduleAt: string; // ISO 8601
  topic?: string;
  tags?: string[];
  /** Metadata preview untuk type "link" (Facebook only) — meta.url wajib diisi */
  meta?: { title?: string; description?: string; url?: string };
};

/** Buat scheduled post → schedule id (status awal "pending") */
export async function replizCreateSchedule(
  cred: ReplizCredentials,
  input: ReplizScheduleInput,
): Promise<string> {
  const data = await replizRequest<{ id?: string; _id?: string; scheduleId?: string }>(
    cred,
    "/public/schedule",
    { method: "POST", body: input },
  );
  // Response create: {"scheduleId":"..."} (HTTP 201); list docs pakai _id/id.
  const id = data?.scheduleId ?? data?.id ?? data?._id;
  if (!id) {
    throw replizMissingId("repliz_no_schedule_id", "Repliz tidak mengembalikan schedule ID.", false);
  }
  return id;
}

/**
 * Ambil satu schedule by id.
 *
 * Pakai endpoint langsung GET /public/schedule/{scheduleId} (docs "Get One
 * Schedule") — mengembalikan doc lengkap (status, postId, account). Sebelumnya
 * kode ini memfilter GET /public/schedule berhalaman untuk mencari id, yang
 * rapuh: schedule di luar halaman pertama (limit 50) tidak pernah ketemu.
 *
 * Fallback ke filter list hanya jika endpoint by-id 404 (kompatibilitas tier
 * lama); pakai accountIds[] (bukan accountIds) supaya filter ditegakkan.
 */
export async function replizGetSchedule(
  cred: ReplizCredentials,
  scheduleId: string,
  accountId: string,
): Promise<ReplizSchedule | null> {
  const mapSchedule = (d: Record<string, unknown>): ReplizSchedule => ({
    id: String(d._id ?? d.id),
    status: d.status as ReplizScheduleStatus,
    postId: d.postId ? String(d.postId) : undefined,
    scheduleAt: String(d.scheduleAt ?? ""),
    type: String(d.type ?? ""),
    accountId: String(d.accountId ?? accountId),
  });

  try {
    const data = await replizRequest<Record<string, unknown>>(cred, `/public/schedule/${scheduleId}`);
    if (data && (data._id || data.id)) return mapSchedule(data);
    return null;
  } catch (error) {
    // 404 "schedule not found" → schedule belum terbentuk di sisi Repliz (race
    // singkat setelah create). Bukan error — sinyal "belum ada" untuk poller.
    if (error instanceof PublishError && error.code === "http_404") return null;
    // Error lain (mis. tier lama tanpa endpoint by-id) → fallback ke filter list.
    const data = await replizRequest<{ docs: Array<Record<string, unknown>> }>(cred, "/public/schedule", {
      query: { page: "1", limit: "50", accountIds: accountId },
    });
    const match = (data?.docs ?? []).find((d) => d._id === scheduleId || d.id === scheduleId);
    return match ? mapSchedule(match) : null;
  }
}

/**
 * List seluruh schedule workspace (GET /public/schedule, docs "Get Schedule").
 * Filter account WAJIB notasi array `accountIds[]` — bentuk tunggal diabaikan
 * API (sama pola dgn /public/comment). Filter status & rentang tanggal hanya
 * tersedia di endpoint list ini (tidak ada di getOne).
 */
export async function replizListSchedules(
  cred: ReplizCredentials,
  opts: {
    page?: number;
    limit?: number;
    accountId?: string;
    status?: ReplizScheduleStatus;
    fromDate?: string; // ISO 8601
    toDate?: string; // ISO 8601
  } = {},
): Promise<{
  docs: ReplizSchedule[];
  totalDocs?: number;
  hasNextPage?: boolean;
  nextPage?: number | null;
}> {
  const query: Record<string, string | string[]> = {
    page: String(opts.page ?? 1),
    limit: String(opts.limit ?? 20),
  };
  if (opts.accountId) query["accountIds[]"] = opts.accountId;
  if (opts.status) query.status = opts.status;
  if (opts.fromDate) query.fromDate = opts.fromDate;
  if (opts.toDate) query.toDate = opts.toDate;

  const data = await replizRequest<{
    docs: Array<Record<string, unknown>>;
    totalDocs?: number;
    hasNextPage?: boolean;
    nextPage?: number | null;
  }>(cred, "/public/schedule", { query });

  return {
    docs: (data?.docs ?? []).map((d) => ({
      id: String(d._id ?? d.id),
      status: (d.status as ReplizScheduleStatus) ?? "pending",
      postId: d.postId ? String(d.postId) : undefined,
      scheduleAt: String(d.scheduleAt ?? ""),
      type: String(d.type ?? ""),
      accountId: String(d.accountId ?? ""),
    })),
    totalDocs: data?.totalDocs,
    hasNextPage: data?.hasNextPage,
    nextPage: data?.nextPage ?? null,
  };
}

/** Update konten/waktu schedule (PUT /public/schedule/{id}, 204). */
export async function replizUpdateSchedule(
  cred: ReplizCredentials,
  scheduleId: string,
  input: ReplizScheduleInput,
): Promise<void> {
  await replizEmpty(cred, `/public/schedule/${scheduleId}`, { method: "PUT", body: input });
}

/** Antrikan ulang schedule gagal (PUT /public/schedule/{id}/retry, 204). */
export async function replizRetrySchedule(cred: ReplizCredentials, scheduleId: string): Promise<void> {
  await replizEmpty(cred, `/public/schedule/${scheduleId}/retry`, { method: "PUT", body: {} });
}

/** Hapus/cancel schedule yang belum tayang (DELETE /public/schedule/{id}, 204) */
export async function replizRemoveSchedule(
  cred: ReplizCredentials,
  scheduleId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/schedule/${scheduleId}`, { method: "DELETE" });
}

/**
 * Hapus beberapa schedule sekaligus (DELETE /public/schedule/mass).
 * Key WAJIB "scheduleIds[]" (bracket) — bentuk tunggal diabaikan API,
 * sama pola dgn accountIds[] di GET /public/comment.
 */
export async function replizMassDeleteSchedules(
  cred: ReplizCredentials,
  scheduleIds: string[],
): Promise<void> {
  await replizEmpty(cred, "/public/schedule/mass", {
    method: "DELETE",
    query: { "scheduleIds[]": scheduleIds },
  });
}
