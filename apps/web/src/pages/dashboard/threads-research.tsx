// Halaman Riset Threads — keyword search & profil publik.
// Lokasi sudah ada di Compose (picker tag lokasi) dan mention sudah masuk inbox
// di halaman Engagement, jadi keduanya tidak diduplikasi di sini.
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Search, UserSearch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type ThreadsAccount = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

type ThreadsPost = {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  is_reply?: boolean;
};

type ThreadsProfile = {
  username?: string;
  name?: string;
  profile_picture_url?: string;
  biography?: string;
  follower_count?: number;
  is_verified?: boolean;
};

type ProfileResult = { profile: ThreadsProfile | null; posts: ThreadsPost[] };

type Tab = "keyword" | "profile";

const TABS: { key: Tab; label: string; icon: typeof Search }[] = [
  { key: "keyword", label: "Cari Post", icon: Search },
  { key: "profile", label: "Profil", icon: UserSearch },
];

function formatDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function ThreadsResearchPage() {
  const [tab, setTab] = useState<Tab>("keyword");
  const [accountId, setAccountId] = useState("");
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"TOP" | "RECENT">("TOP");

  const accountsQuery = useQuery({
    queryKey: ["threads-accounts"],
    queryFn: () => api.get<{ accounts: ThreadsAccount[] }>("/threads/accounts"),
  });
  const accounts = accountsQuery.data?.accounts ?? [];
  const selected = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const effectiveId = selected?.id ?? "";

  const params = (extra: Record<string, string>) =>
    new URLSearchParams({ accountId: effectiveId, ...extra }).toString();

  const searchPosts = useMutation({
    mutationFn: () =>
      api.get<{ posts: ThreadsPost[] }>(
        `/threads/search?${params({ q: query.trim(), searchType })}`,
      ),
    onError: (error) => toast.error((error as Error).message),
  });

  const searchProfiles = useMutation({
    mutationFn: () =>
      api.get<ProfileResult>(`/threads/discover?${params({ username: query.trim() })}`),
    onError: (error) => toast.error((error as Error).message),
  });

  const activeMutation = tab === "keyword" ? searchPosts : searchProfiles;

  function runSearch() {
    if (!effectiveId) {
      toast.error("Belum ada akun Threads yang terhubung");
      return;
    }
    if (!query.trim()) {
      toast.error("Masukkan kata kunci dulu");
      return;
    }
    if (tab === "keyword") searchPosts.mutate();
    else searchProfiles.mutate();
  }

  if (accountsQuery.isLoading) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat akun Threads…
        </div>
      </div>
    );
  }

  if (accountsQuery.isError) {
    return (
      <div className="card p-6">
        <p className="text-[var(--error)] text-sm">
          {(accountsQuery.error as Error).message || "Gagal memuat akun Threads"}
        </p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="card p-6">
        <EmptyState
          title="Belum ada akun Threads"
          description="Hubungkan akun Threads dulu di halaman Akun Sosmed untuk memakai riset keyword dan profil."
        />
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Riset Threads</h2>
          <p className="text-[var(--text-muted)] text-xs">
            Cari post publik dan profil — memakai izin Threads advanced access. Tag lokasi ada di
            Compose, mention ada di halaman Engagement.
          </p>
        </div>
        <select
          value={effectiveId}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs"
          aria-label="Pilih akun Threads"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.username ?? a.id}
            </option>
          ))}
        </select>
      </div>

      {/* Catatan approval — beberapa endpoint mengembalikan hasil kosong selama
          izin advanced access belum disetujui App Review */}
      <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-2 text-[11px] text-[var(--text-muted)]">
        Sebagian fitur ini butuh izin Threads advanced access yang disetujui App Review. Selama
        belum disetujui: keyword search hanya mengembalikan post milik sendiri, dan profil publik
        bisa kosong/gagal.
      </p>

      {/* Tab */}
      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setQuery("");
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 font-medium text-xs transition-colors",
              tab === t.key
                ? "bg-gradient text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
          placeholder={
            tab === "keyword" ? "kata kunci, mis. kopi susu" : "username persis, mis. threads"
          }
          className="h-9 max-w-md flex-1"
        />
        {tab === "keyword" && (
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value as "TOP" | "RECENT")}
            className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs"
            aria-label="Tipe pencarian"
          >
            <option value="TOP">Top</option>
            <option value="RECENT">Terbaru</option>
          </select>
        )}
        <Button size="sm" onClick={runSearch} disabled={activeMutation.isPending}>
          {activeMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Cari
        </Button>
      </div>

      {/* Error pencarian (pesan asli dari Threads API) */}
      {activeMutation.isError && (
        <p className="mb-3 break-words text-[var(--error)] text-sm">
          {(activeMutation.error as Error).message}
        </p>
      )}

      {/* Hasil */}
      {tab === "keyword" &&
        (searchPosts.data?.posts.length ? (
          <ul className="space-y-2">
            {searchPosts.data.posts.map((p) => (
              <li
                key={p.id}
                className="rounded-[var(--radius-md)] border border-[var(--border-light)] p-3"
              >
                <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
                  <span className="font-medium text-[var(--text-primary)]">
                    @{p.username ?? "—"}
                  </span>
                  {p.timestamp && <span>{formatDate(p.timestamp)}</span>}
                  {p.is_reply && <span>· reply</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{p.text ?? "(tanpa teks)"}</p>
                {p.permalink && (
                  <a
                    href={p.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[var(--accent-gold)] text-xs hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Buka di Threads
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Belum ada hasil"
            description="Masukkan kata kunci dan tekan Cari. Bila app belum di-approve untuk threads_keyword_search, hasil hanya mencakup post milik sendiri — post akun baru biasanya kosong."
          />
        ))}

      {tab === "profile" &&
        (searchProfiles.data?.profile ? (
          <div className="space-y-3">
            {(() => {
              const p = searchProfiles.data.profile;
              return (
                <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-light)] p-3">
                  <Avatar
                    name={p.name ?? p.username ?? "?"}
                    src={p.profile_picture_url}
                    className="h-12 w-12 text-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {p.name ?? p.username ?? "—"}
                      {p.is_verified && <span className="ml-1 text-[var(--accent-gold)]">✓</span>}
                    </p>
                    <p className="text-[var(--text-muted)] text-xs">
                      @{p.username ?? "—"}
                      {typeof p.follower_count === "number" && (
                        <> · {new Intl.NumberFormat("id-ID").format(p.follower_count)} pengikut</>
                      )}
                    </p>
                    {p.biography && (
                      <p className="mt-1 whitespace-pre-wrap text-sm">{p.biography}</p>
                    )}
                    {p.username && (
                      <a
                        href={`https://www.threads.net/@${p.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[var(--accent-gold)] text-xs hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Buka profil
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}
            {searchProfiles.data.posts.length > 0 ? (
              <ul className="space-y-2">
                {searchProfiles.data.posts.map((post) => (
                  <li
                    key={post.id}
                    className="rounded-[var(--radius-md)] border border-[var(--border-light)] p-3"
                  >
                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
                      {post.timestamp && <span>{formatDate(post.timestamp)}</span>}
                      {post.is_reply && <span>· reply</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {post.text ?? "(tanpa teks)"}
                    </p>
                    {post.permalink && (
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[var(--accent-gold)] text-xs hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Buka di Threads
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--text-muted)] text-xs">
                Tidak ada post publik terbaru yang bisa ditampilkan.
              </p>
            )}
          </div>
        ) : searchProfiles.isSuccess ? (
          <EmptyState
            title="Profil tidak ditemukan"
            description="Threads hanya mendukung pencarian username persis (bukan kata kunci). Coba tulis username lengkap tanpa @."
          />
        ) : (
          <EmptyState
            title="Cari profil publik"
            description="Masukkan username persis (tanpa @) untuk melihat profil publik Threads dan post terbarunya."
          />
        ))}
    </div>
  );
}
