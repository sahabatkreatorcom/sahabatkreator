// Inbox DM — percakapan direct message Instagram/Facebook (master-detail)
// List kiri: percakapan dengan badge unread. Thread kanan: bubble + composer.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { InboxHeader } from "@/components/inbox/inbox-header";
import {
  ConversationList,
  ConversationListHeader,
  type DmConversation,
} from "@/components/inbox/conversation-list";
import { MessageThread } from "@/components/inbox/message-thread";
import { api } from "@/lib/api";

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [lastManualSyncAt, setLastManualSyncAt] = useState<Date | null>(null);

  const syncNow = useMutation({
    mutationFn: () =>
      api.post<{ accounts: number; newMessages: number; errors: string[] }>("/dm/sync-now"),
    onSuccess: (res) => {
      setLastManualSyncAt(new Date());
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["dm-unread-count"] });
      if (res.errors.length > 0) {
        toast.error(`Sync DM gagal pada ${res.errors.length} akun`, { description: res.errors[0] });
      } else {
        toast.success(
          res.newMessages > 0
            ? `Sync selesai — ${res.newMessages} pesan baru`
            : "Sync selesai — tidak ada pesan baru",
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["dm-conversations", unreadOnly, q, page],
    queryFn: () =>
      api.get<{ conversations: DmConversation[]; page: number }>(
        `/dm?unread=${unreadOnly}&page=${page}&perPage=20${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      ),
  refetchInterval: 30_000,
  });

  const { data: unread } = useQuery({
    queryKey: ["dm-unread-count"],
    queryFn: () => api.get<{ conversations: number; messages: number }>("/dm/unread-count"),
    refetchInterval: 60_000,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post("/dm/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["dm-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["dm-thread"] });
    },
  });

  const conversations = data?.conversations ?? [];
  const unreadMessages = unread?.messages ?? 0;

  return (
    <div className="space-y-4">
      <InboxHeader
        unreadMessages={unreadMessages}
        isSyncing={syncNow.isPending}
        isRefreshing={isFetching && !isLoading}
        lastManualSyncAt={lastManualSyncAt}
        onSync={() => syncNow.mutate()}
      />

      <div className="grid h-[calc(100vh-13rem)] min-h-[30rem] grid-cols-1 gap-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-light)] bg-[var(--bg-secondary)] md:grid-cols-5">
        {/* List percakapan — mobile: full width, desktop: 2/5 */}
        <div className={`min-h-0 flex-col md:col-span-2 ${selectedId ? "hidden md:flex" : "flex"}`}>
          <ConversationListHeader
            q={q}
            onQChange={(value) => {
              setQ(value);
              setPage(1);
            }}
            unreadOnly={unreadOnly}
            onUnreadOnlyChange={(value) => {
              setUnreadOnly(value);
              setPage(1);
            }}
            onMarkAllRead={() => markAllRead.mutate()}
            unreadTotal={unreadMessages}
            canMarkAll={unreadMessages > 0 && !markAllRead.isPending}
          />
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <Inbox className="h-8 w-8 animate-pulse text-[var(--text-muted)]" />
            </div>
          ) : isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="font-medium text-sm">Inbox tidak dapat dimuat</p>
              <p className="text-[var(--text-secondary)] text-xs">Periksa koneksi lalu coba lagi.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-[var(--radius-md)] bg-[var(--accent-gold)] px-3 py-2 font-medium text-white text-xs"
              >
                Coba lagi
              </button>
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {!isLoading && (page > 1 || conversations.length === 20) && (
            <div className="flex items-center justify-between border-[var(--border-light)] border-t p-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Sebelumnya
              </button>
              <span className="text-[var(--text-muted)] text-xs">Halaman {page}</span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={conversations.length < 20}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs disabled:opacity-40"
              >
                Berikutnya
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Thread — mobile: overlay full, desktop: 3/5 */}
        <div className={`min-h-0 md:col-span-3 ${selectedId ? "block" : "hidden md:block"}`}>
          {selectedId ? (
            <MessageThread conversationId={selectedId} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <Inbox className="h-10 w-10 text-[var(--text-muted)]" />
              <p className="text-[var(--text-secondary)] text-sm">
                Pilih percakapan untuk melihat pesan dan membalas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
