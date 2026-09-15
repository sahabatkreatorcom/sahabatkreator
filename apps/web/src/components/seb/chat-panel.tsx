// Panel chat SEB — multi-sesi, bubble pesan, attachment media
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SebChatAttachment, SebChatMessage, SebChatSession } from "./types";

function AttachmentGrid({ attachments }: { attachments: SebChatAttachment[] }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {attachments.slice(0, 6).map((att) =>
        att.previewUrl && att.type === "image" ? (
          <img
            key={att.id}
            src={att.previewUrl}
            alt={att.title}
            loading="lazy"
            className="h-20 w-full rounded-[var(--radius-md)] object-cover"
          />
        ) : (
          <div
            key={att.id}
            className="flex h-20 flex-col items-center justify-center rounded-[var(--radius-md)] bg-black/10 p-2 text-center dark:bg-white/10"
          >
            <span className="font-medium text-[10px] leading-tight">{att.title}</span>
            <span className="text-[10px] text-[var(--text-muted)]">{att.type ?? "file"}</span>
          </div>
        ),
      )}
    </div>
  );
}

export function SebChatPanel({
  onError,
  className,
}: {
  onError?: (message: string) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessionsQuery = useQuery({
    queryKey: ["seb-chat-sessions"],
    queryFn: () => api.get<{ sessions: SebChatSession[] }>("/seb/chat/sessions"),
  });

  const messagesQuery = useQuery({
    queryKey: ["seb-chat-messages", activeSessionId],
    queryFn: () =>
      api.get<{ messages: SebChatMessage[] }>(`/seb/chat/sessions/${activeSessionId}/messages`),
    enabled: !!activeSessionId,
  });

  useEffect(() => {
    if (!activeSessionId && sessionsQuery.data?.sessions?.length) {
      setActiveSessionId(sessionsQuery.data.sessions[0].id);
    }
  }, [sessionsQuery.data, activeSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data]);

  const sendMessage = useMutation({
    mutationFn: (message: string) =>
      api.post<{
        session: SebChatSession;
        message: SebChatMessage;
      }>("/seb/chat", {
        sessionId: activeSessionId ?? undefined,
        message,
      }),
    onSuccess: (res) => {
      if (!activeSessionId) {
        setActiveSessionId(res.session.id);
      }
      queryClient.invalidateQueries({ queryKey: ["seb-chat-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["seb-chat-messages"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      onError?.(e.message);
    },
  });

  const deleteSession = useMutation({
    mutationFn: (id: string) => api.delete(`/seb/chat/sessions/${id}`),
    onSuccess: (_data, id) => {
      if (activeSessionId === id) setActiveSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["seb-chat-sessions"] });
      toast.success("Sesi dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sessions = sessionsQuery.data?.sessions ?? [];
  const messages = messagesQuery.data?.messages ?? [];
  const busy = sendMessage.isPending;

  return (
    <div className={cn("card flex h-[560px] flex-col overflow-hidden p-0", className)}>
      {/* Header sesi */}
      <div className="flex items-center gap-2 border-[var(--border-light)] border-b p-3">
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 font-medium text-xs transition-colors",
                activeSessionId === s.id
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveSessionId(s.id)}
                className="max-w-40 truncate"
                title={s.title}
              >
                {s.title}
              </button>
              <button
                type="button"
                onClick={() => deleteSession.mutate(s.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Hapus sesi"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveSessionId(null);
            setDraft("");
          }}
          className="flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 font-medium text-xs transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Baru
        </button>
      </div>

      {/* Daftar pesan */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {sessions.length === 0 && (
          <p className="mt-8 text-center text-[var(--text-secondary)] text-sm">
            Mulai percakapan pertama Anda dengan SEB — tanya apa saja soal konten dan performa
            sosmed Anda.
          </p>
        )}
        {activeSessionId && messages.length === 0 && !messagesQuery.isLoading && (
          <p className="mt-8 text-center text-[var(--text-secondary)] text-sm">
            Belum ada pesan di sesi ini.
          </p>
        )}
        {messages.map((m) => {
          const isUser = m.role === "user";
          const attachments = m.metadata?.attachments ?? [];
          return (
            <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-[var(--radius-lg)] px-3.5 py-2.5 text-sm",
                  isUser
                    ? "bg-[var(--accent-gold)] text-white"
                    : "border border-[var(--border-light)] bg-[var(--bg-tertiary)]",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                {!isUser && attachments.length > 0 && <AttachmentGrid attachments={attachments} />}
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3.5 py-2.5 text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-gold)]" />
              SEB sedang berpikir…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        className="flex items-end gap-2 border-[var(--border-light)] border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const message = draft.trim();
          if (!message || busy) return;
          setDraft("");
          sendMessage.mutate(message);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const message = draft.trim();
              if (!message || busy) return;
              setDraft("");
              sendMessage.mutate(message);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Tanya SEB… (Enter kirim, Shift+Enter baris baru)"
          className="input max-h-32 flex-1 resize-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          className="rounded-[var(--radius-md)] bg-[var(--accent-gold)] p-2.5 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label="Kirim"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
