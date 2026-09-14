// Inbox DM — percakapan direct message Instagram/Facebook (master-detail)
// List kiri: percakapan dengan badge unread. Thread kanan: bubble + composer.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { useState } from "react";
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

  const { data, isLoading } = useQuery({
    queryKey: ["dm-conversations", unreadOnly, q],
    queryFn: () =>
      api.get<{ conversations: DmConversation[] }>(
        `/dm?unread=${unreadOnly}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl">Inbox DM</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Percakapan direct message Instagram &amp; Facebook — sync otomatis tiap 15 menit.
          </p>
        </div>
        {unreadMessages > 0 && (
          <span className="rounded-full bg-[var(--accent-gold-light)] px-3 py-1 font-semibold text-[var(--accent-gold)] text-sm">
            {unreadMessages} pesan belum dibaca
          </span>
        )}
      </div>

      <div className="grid h-[calc(100vh-13rem)] min-h-[30rem] grid-cols-1 gap-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-light)] bg-[var(--bg-secondary)] md:grid-cols-5">
        {/* List percakapan — mobile: full width, desktop: 2/5 */}
        <div className={`min-h-0 flex-col md:col-span-2 ${selectedId ? "hidden md:flex" : "flex"}`}>
          <ConversationListHeader
            q={q}
            onQChange={setQ}
            unreadOnly={unreadOnly}
            onUnreadOnlyChange={setUnreadOnly}
            onMarkAllRead={() => markAllRead.mutate()}
            unreadTotal={unreadMessages}
            canMarkAll={unreadMessages > 0 && !markAllRead.isPending}
          />
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <Inbox className="h-8 w-8 animate-pulse text-[var(--text-muted)]" />
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
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
