// LinkedIn — daftar company yang di-admin user (multi-company, note.md #15).

import { LINKEDIN_API_VERSION, LINKEDIN_REST_URL } from "../config";
import { httpRequest } from "../http";
import { PublishError } from "../types";
import type { LinkedInOrganization } from "./types";

/**
 * GET /rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED — company tempat user
 * ADMIN. Butuh scope `rw_organization_admin` dari product ter-approve (Community Management API,
 * bukan self-serve). Return [] bila gagal (scope belum granted / product belum approved) — caller
 * fallback ke person-only.
 *
 * Bentuk respons (doc resmi li-lms-2026-08, update 30 Apr 2026): URN organization dikembalikan
 * sebagai `organizationTarget` pada contoh paginasi dan sebagai `organization` pada contoh lain —
 * kedua field diterima. Finder ini TIDAK memuat `localizedName`/`vanityName` (tidak ada projection
 * resmi untuk itu), jadi nama diambil via Organization Lookup `GET /rest/organizations/{id}`.
 *
 * `strict: true` (dipakai flow `linkedin_org`) → error HTTP di-throw, bukan dianggap "tanpa
 * company", supaya kegagalan scope/review app tidak tersamar sebagai picker kosong.
 */
export async function fetchLinkedInAdminOrganizations(
  at: string,
  opts: { strict?: boolean } = {},
): Promise<LinkedInOrganization[]> {
  const headers = {
    Authorization: `Bearer ${at}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
  const res = await httpRequest<{
    elements?: Array<{
      organizationTarget?: string;
      organization?: string | { id?: number | string };
      role?: string;
      state?: string;
    }>;
  }>(`${LINKEDIN_REST_URL}/rest/organizationAcls`, {
    query: { q: "roleAssignee", role: "ADMINISTRATOR", state: "APPROVED" },
    headers,
    retries: 0, // gagal cepat — 403 scope berarti product belum approved, jangan retry
  });
  if (!res.ok) {
    if (opts.strict) {
      throw new PublishError(
        "oauth_org_lookup_failed",
        `Gagal mengambil daftar halaman company LinkedIn (HTTP ${res.status}) — pastikan app Community Management API sudah approved & user adalah ADMIN halaman.`,
        false,
      );
    }
    return [];
  }

  const data = await res.json();
  const seen = new Set<string>();
  const organizations: LinkedInOrganization[] = [];
  for (const el of data.elements ?? []) {
    const id = linkedinOrganizationId(el.organizationTarget ?? el.organization);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const detail = await fetchLinkedInOrganization(id, at);
    organizations.push({
      id,
      name: detail?.name ?? id, // fallback: Organization Lookup gagal → tampilkan ID
      vanityName: detail?.vanityName ?? null,
    });
  }
  return organizations;
}

/** Organization ID numerik dari URN `urn:li:organization:{id}` (atau objek `organization`). */
function linkedinOrganizationId(
  value: string | { id?: number | string } | undefined,
): string | null {
  const raw = typeof value === "string" ? value : value?.id != null ? String(value.id) : null;
  if (!raw) return null;
  const id = raw.startsWith("urn:li:") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
  return /^\d+$/.test(id) ? id : null;
}

/** Organization Lookup admin — `localizedName` + `vanityName`; null bila gagal (403/dsb). */
async function fetchLinkedInOrganization(
  id: string,
  at: string,
): Promise<{ name: string; vanityName: string | null } | null> {
  const res = await httpRequest<{ localizedName?: string; vanityName?: string }>(
    `${LINKEDIN_REST_URL}/rest/organizations/${id}`,
    {
      headers: {
        Authorization: `Bearer ${at}`,
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      retries: 0,
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const name = data.localizedName ?? data.vanityName;
  return name ? { name, vanityName: data.vanityName ?? null } : null;
}
