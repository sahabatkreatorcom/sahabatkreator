// Automation & Automation Template API (Gold+) — CRUD automation per post +
// template reusable. Docs: docs/repliz/Automation/, docs/repliz/Automation Template/
//
// Catatan: Sahabat Kreator punya engine automation sendiri
// (packages/publishing/src/automation.ts). API Repliz ini adalah alternatif
// yang berjalan di sisi Repliz (mis. untuk akun bridge tanpa webhook native).
// Config shape mengikuti docs "Automation Configuration Guide".

import { replizEmpty, replizMissingId, replizRequest, type ReplizCredentials } from "./shared";

// ---------- Config shape (docs Guides & Manuals/automationConfig.md) ----------

export type ReplizAutomationKeywordRule = { keyword: string; text: string };
export type ReplizAutomationKeywordConfig = {
  isExactMatch: boolean;
  values: ReplizAutomationKeywordRule[];
};
export type ReplizAutomationMatchConfig = {
  isActive: boolean;
  isExactMatch: boolean;
  keywords: string[];
};
export type ReplizAutomationDelayConfig = {
  isActive: boolean;
  value: number; // detik (dashboard Repliz 10–60)
  type: "second";
};
export type ReplizAutomationButton = {
  type: "postback" | "web_url";
  title: string;
  payload?: string;
  url?: string;
};
export type ReplizAutomationOpening = {
  postback?: {
    isActive: boolean;
    text: string;
    image?: string;
    button: ReplizAutomationButton;
  };
  additional?: {
    isActive: boolean;
    isPreventBeforeFollow: boolean;
    text: string;
    image?: string;
    button: ReplizAutomationButton;
  };
  webUrl?: { text: string; image?: string; buttons: ReplizAutomationButton[] };
};

export type ReplizAutomationDelete = {
  isActive: boolean;
  type: "keyword" | "ai";
  keywords: string[];
  prompt: string;
};
export type ReplizAutomationReply = {
  isActive: boolean;
  type: "text" | "keyword" | "ai";
  text: string;
  prompt: string;
  isIncludeContentContext: boolean;
  keyword: ReplizAutomationKeywordConfig;
  condition: ReplizAutomationMatchConfig;
  exception: ReplizAutomationMatchConfig;
  delay: ReplizAutomationDelayConfig;
};
export type ReplizAutomationLike = { isActive: boolean };
export type ReplizAutomationMessage = {
  isActive: boolean;
  type: "text" | "keyword" | "ai" | "opening";
  text: string;
  prompt: string;
  opening: ReplizAutomationOpening;
  keyword: ReplizAutomationKeywordConfig;
  condition: ReplizAutomationMatchConfig;
  delay: ReplizAutomationDelayConfig;
};
export type ReplizAutomationChat = {
  isActive: boolean;
  type: "text" | "keyword" | "ai";
  text: string;
  prompt: string;
  keyword: ReplizAutomationKeywordConfig;
  delay: ReplizAutomationDelayConfig;
};

export type ReplizAutomationConfig = {
  delete: ReplizAutomationDelete;
  reply: ReplizAutomationReply;
  like: ReplizAutomationLike;
  message: ReplizAutomationMessage;
  /** Story shape sama persis dgn message (docs: "Same structure as Message Object") */
  story: ReplizAutomationMessage;
  chat: ReplizAutomationChat;
};

// ---------- Automation (per post) ----------

/** Hasil GET /public/automation/{id} — automation yang menempel pada satu post */
export type ReplizAutomation = {
  _id: string;
  /** Post yang di-automate (konteks) */
  detail?: Record<string, unknown>;
  config: ReplizAutomationConfig;
};

/** Buat automation untuk satu post → automationId (POST /public/automation) */
export async function replizCreateAutomation(
  cred: ReplizCredentials,
  input: { contentId: string; accountId: string; config: ReplizAutomationConfig },
): Promise<string> {
  const data = await replizRequest<{ automationId?: string }>(cred, "/public/automation", {
    method: "POST",
    body: input,
  });
  if (!data?.automationId) {
    throw replizMissingId("repliz_no_automation_id", "Repliz tidak mengembalikan automationId.", false);
  }
  return data.automationId;
}

/** List automation workspace (GET /public/automation). */
export async function replizListAutomations(
  cred: ReplizCredentials,
  opts: { page?: number; limit?: number; accountId?: string; search?: string } = {},
): Promise<{
  docs: ReplizAutomation[];
  totalDocs?: number;
  hasNextPage?: boolean;
  nextPage?: number | null;
}> {
  const query: Record<string, string | string[]> = {
    page: String(opts.page ?? 1),
    limit: String(opts.limit ?? 20),
  };
  if (opts.accountId) query["accountIds[]"] = opts.accountId;
  if (opts.search) query.search = opts.search;

  const data = await replizRequest<{
    docs: Array<Record<string, unknown>>;
    totalDocs?: number;
    hasNextPage?: boolean;
    nextPage?: number | null;
  }>(cred, "/public/automation", { query });

  return {
    docs: (data?.docs ?? []).map((d) => ({
      _id: String(d._id ?? d.id),
      detail: d.detail as Record<string, unknown> | undefined,
      config: d.config as ReplizAutomationConfig,
    })),
    totalDocs: data?.totalDocs,
    hasNextPage: data?.hasNextPage,
    nextPage: data?.nextPage ?? null,
  };
}

/** Ambil satu automation by id (GET /public/automation/{automationId}). */
export async function replizGetOneAutomation(
  cred: ReplizCredentials,
  automationId: string,
): Promise<ReplizAutomation | null> {
  const data = await replizRequest<Record<string, unknown>>(
    cred,
    `/public/automation/${automationId}`,
  );
  if (!data || (!data._id && !data.id)) return null;
  return {
    _id: String(data._id ?? data.id),
    detail: data.detail as Record<string, unknown> | undefined,
    config: data.config as ReplizAutomationConfig,
  };
}

/** Update config automation (PUT /public/automation/{automationId}, 204). */
export async function replizUpdateAutomation(
  cred: ReplizCredentials,
  automationId: string,
  config: ReplizAutomationConfig,
): Promise<void> {
  await replizEmpty(cred, `/public/automation/${automationId}`, { method: "PUT", body: { config } });
}

/** Hapus automation (DELETE /public/automation/{automationId}, 204). */
export async function replizRemoveAutomation(
  cred: ReplizCredentials,
  automationId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/automation/${automationId}`, { method: "DELETE" });
}

// ---------- Automation Template ----------

/** Template reusable (GET /public/template) */
export type ReplizAutomationTemplate = {
  _id: string;
  name: string;
  config: ReplizAutomationConfig;
};

/** Buat template reusable → templateId (POST /public/template) */
export async function replizCreateTemplate(
  cred: ReplizCredentials,
  input: { name: string; config: ReplizAutomationConfig },
): Promise<string> {
  const data = await replizRequest<{ _id?: string; templateId?: string; id?: string }>(
    cred,
    "/public/template",
    { method: "POST", body: input },
  );
  const id = data?.templateId ?? data?._id ?? data?.id;
  if (!id) {
    throw replizMissingId("repliz_no_template_id", "Repliz tidak mengembalikan template ID.", false);
  }
  return id;
}

/** List template reusable (GET /public/template). */
export async function replizListTemplates(
  cred: ReplizCredentials,
  opts: { page?: number; limit?: number; search?: string } = {},
): Promise<{
  docs: ReplizAutomationTemplate[];
  totalDocs?: number;
  hasNextPage?: boolean;
  nextPage?: number | null;
}> {
  const data = await replizRequest<{
    docs: Array<Record<string, unknown>>;
    totalDocs?: number;
    hasNextPage?: boolean;
    nextPage?: number | null;
  }>(cred, "/public/template", {
    query: { page: String(opts.page ?? 1), limit: String(opts.limit ?? 20), ...(opts.search ? { search: opts.search } : {}) },
  });

  return {
    docs: (data?.docs ?? []).map((d) => ({
      _id: String(d._id ?? d.id),
      name: String(d.name ?? ""),
      config: d.config as ReplizAutomationConfig,
    })),
    totalDocs: data?.totalDocs,
    hasNextPage: data?.hasNextPage,
    nextPage: data?.nextPage ?? null,
  };
}

/** Ambil satu template by id (GET /public/template/{templateId}). */
export async function replizGetOneTemplate(
  cred: ReplizCredentials,
  templateId: string,
): Promise<ReplizAutomationTemplate | null> {
  const data = await replizRequest<Record<string, unknown>>(cred, `/public/template/${templateId}`);
  if (!data || (!data._id && !data.id)) return null;
  return {
    _id: String(data._id ?? data.id),
    name: String(data.name ?? ""),
    config: data.config as ReplizAutomationConfig,
  };
}

/** Update template (PUT /public/template/{templateId}, 204). */
export async function replizUpdateTemplate(
  cred: ReplizCredentials,
  templateId: string,
  input: { name: string; config: ReplizAutomationConfig },
): Promise<void> {
  await replizEmpty(cred, `/public/template/${templateId}`, { method: "PUT", body: input });
}

/** Hapus template (DELETE /public/template/{templateId}, 204). */
export async function replizRemoveTemplate(
  cred: ReplizCredentials,
  templateId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/template/${templateId}`, { method: "DELETE" });
}
