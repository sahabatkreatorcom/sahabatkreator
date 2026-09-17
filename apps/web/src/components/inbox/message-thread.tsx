// Inbox DM — panel thread percakapan (bubble + composer + assignment)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Send, UserCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SavedResponsesPicker } from "@/components/ui/saved-responses-picker";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

export type ThreadConversation = {
  id: string;
  platform: string;
  accountUsername: string;
  partnerId: string;
  partnerUsername: string | null;
  partnerName: string | null;
  partnerAvatarUrl: string | null;
  assignedMemberId: string | null;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  senderUsername: string | null;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  occurredAt: string;
};

type Member = {
  id: string;
  userId: string;
  role: string;
  user?: { name?: string; email?: string };
};

export function MessageThread({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dm-thread", conversationId],
    queryFn: () =>
      api.get<{ conversation: ThreadConversation; messages: Message[] }>(
        `/dm/${conversationId}/messages`,
      ),
    // Refresh berkala untuk menangkap pesan baru (sync worker tiap 5 menit)
    refetchInterval: 60_000,
  });

  // Anggota tim untuk assignment (better-auth organization)
  const { data: membersData } = useQuery({
    queryKey: ["org-members"],
    queryFn: async () => {
      const { authClient } = await import("@/lib/auth-client");
      const res = await authClient.organization.listMembers();
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const sendReply = useMutation({
    mutationFn: () =>
      api.post<{ localOnly?: boolean }>(`/dm/${conversationId}/reply`, { content: reply }),
    onSuccess: (res: { localOnly?: boolean }) => {
      if (res.localOnly) {
        toast.info("Balasan dicatat lokal (akun manual — tidak terkirim ke platform)");
      } else {
        toast.success("Balasan terkirim");
      }
      setReply("");
      textareaRef.current?.focus();
      queryClient.invalidateQueries({ queryKey: ["dm-thread", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["dm-unread-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: (memberId: string | null) =>
      api.patch(`/dm/${conversationId}`, { assignedMemberId: memberId }),
    onSuccess: () => {
      toast.success("Percakapan di-assign");
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["dm-thread", conversationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const messages = data?.messages ?? [];
  const conv = data?.conversation;

  // Auto-scroll ke bawah saat pesan baru / ganti percakapan
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, conversationId]);

  // Auto-grow textarea mengikuti isi (maks setara max-h-32 = 128px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [reply]);

  // Enter kirim / Shift+Enter newline (pattern chat standard)
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (reply.trim() && !sendReply.isPending) sendReply.mutate();
    }
  }

  const members: Member[] = membersData?.members ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header thread */}
      <div className="flex items-center gap-3 border-[var(--border-light)] border-b p-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--bg-tertiary)] md:hidden"
          aria-label="Kembali ke daftar"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {conv && (
          <>
            <Avatar
              name={conv.partnerName ?? conv.partnerUsername ?? conv.partnerId}
              src={conv.partnerAvatarUrl ?? undefined}
              className="h-10 w-10 text-sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-sm">
                {conv.partnerName ?? conv.partnerUsername ?? conv.partnerId}
              </p>
              <p className="truncate text-[var(--text-muted)] text-xs">
                @{conv.accountUsername}
                {conv.partnerUsername && ` · dm dari @${conv.partnerUsername}`}
              </p>
            </div>
            {/* Assignment ke anggota tim */}
            <label className="relative flex items-center gap-1.5">
              <UserCog className="h-4 w-4 text-[var(--text-muted)]" />
              <select
                className="h-8 max-w-36 rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 text-xs"
                value={conv.assignedMemberId ?? ""}
                onChange={(e) => assign.mutate(e.target.value === "" ? null : e.target.value)}
                aria-label="Assign ke anggota tim"
              >
                <option value="">Belum di-assign</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user?.name ?? m.user?.email ?? m.id}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {/* Bubble pesan */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : messages.length === 0 ? (
          <p className="pt-8 text-center text-[var(--text-secondary)] text-sm">
            Belum ada pesan di percakapan ini.
          </p>
        ) : (
          messages.map((msg, i) => {
            const isOutbound = msg.direction === "outbound";
            // Grouping: pesan beruntun dari arah sama tanpa header
            const prev = messages[i - 1];
            const isGroupStart = !prev || prev.direction !== msg.direction;
            return (
              <div key={msg.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-[var(--radius-lg)] px-3 py-2 ${
                    isOutbound
                      ? "bg-[var(--accent-gold)] text-white"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                  }`}
                >
                  {isGroupStart && (
                    <p
                      className={`mb-0.5 font-semibold text-xs ${
                        isOutbound ? "text-white/80" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {isOutbound
                        ? "Anda"
                        : (msg.senderUsername ?? conv?.partnerName ?? "Pesan masuk")}
                    </p>
                  )}
                  {msg.text && <p className="whitespace-pre-wrap text-sm">{msg.text}</p>}
                  {msg.mediaUrl && (
                    <img
                      src={msg.mediaUrl}
                      alt="Lampiran"
                      className="mt-1 max-h-48 rounded-[var(--radius-md)] object-cover"
                      loading="lazy"
                    />
                  )}
                  <p
                    className={`mt-0.5 text-right text-[10px] ${
                      isOutbound ? "text-white/70" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {formatRelativeTime(msg.occurredAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-[var(--border-light)] border-t p-3">
        <div className="flex items-end gap-2">
          <SavedResponsesPicker onPick={(content) => setReply(content)} compact />
          <textarea
            ref={textareaRef}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Tulis balasan… (Enter kirim, Shift+Enter baris baru)"
            className="max-h-32 min-h-9 flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
          />
          <Button
            size="icon"
            onClick={() => reply.trim() && sendReply.mutate()}
            disabled={!reply.trim() || sendReply.isPending}
            aria-label="Kirim balasan"
          >
            {sendReply.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
