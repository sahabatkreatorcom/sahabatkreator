"use client";

import { ArrowLeft, Bot, Search, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  type Platform,
} from "@/lib/platforms/config";
import { cn } from "@/lib/utils";

interface DMConversation {
  id: string;
  platform: Platform;
  participantUsername: string;
  participantAvatar?: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
}

interface DMMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  text: string;
  timestamp: Date;
  isFromBot: boolean;
}

type View = "list" | "conversation";

const PLATFORM_OPTIONS: Platform[] = [
  "INSTAGRAM",
  "INSTAGRAM_PAGE",
  "FACEBOOK",
  "TIKTOK",
  "LINKEDIN",
];

export default function DMInboxPage() {
  const [view, setView] = useState<View>("list");
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<DMConversation | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<Platform | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (platformFilter !== "ALL")
        params.set("platform", platformFilter.toLowerCase());

      const res = await fetch(`/api/dm/conversations?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal memuat conversations.");
      }
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat DM.");
    } finally {
      setLoading(false);
    }
  }, [platformFilter]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const loadMessages = useCallback(
    async (conversationId: string, platform: Platform) => {
      try {
        const params = new URLSearchParams({
          platform: platform.toLowerCase(),
        });
        const res = await fetch(
          `/api/dm/conversations/${conversationId}?${params.toString()}`,
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Gagal memuat messages.");
        }
        const data = await res.json();
        setMessages(data.messages ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat messages.");
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id, selectedConversation.platform);
    }
  }, [selectedConversation, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  async function sendMessage() {
    if (!selectedConversation || !newMessage.trim() || sending) return;

    setSending(true);
    try {
      const params = new URLSearchParams({
        platform: selectedConversation.platform.toLowerCase(),
      });
      const res = await fetch(
        `/api/dm/conversations/${selectedConversation.id}?${params.toString()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: newMessage }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal mengirim pesan.");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId || `temp-${Date.now()}`,
          conversationId: selectedConversation.id,
          senderId: "bot",
          senderUsername: "Bot",
          text: newMessage,
          timestamp: new Date(),
          isFromBot: true,
        },
      ]);
      setNewMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim pesan.");
    } finally {
      setSending(false);
    }
  }

  function openConversation(conv: DMConversation) {
    setSelectedConversation(conv);
    setView("conversation");
    setError(null);
  }

  function goBack() {
    setView("list");
    setSelectedConversation(null);
    setMessages([]);
    setError(null);
  }

  const filteredConversations = conversations.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.participantUsername.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          {view === "conversation" && (
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-lg font-semibold">
              {view === "list"
                ? "DM Inbox"
                : selectedConversation?.participantUsername}
            </h1>
            <p className="text-sm text-muted-foreground">
              {view === "list"
                ? "Pesan langsung dari media sosial"
                : PLATFORM_LABELS[
                    selectedConversation?.platform ?? "INSTAGRAM"
                  ]}
            </p>
          </div>
        </div>
        {view === "list" && (
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">AI Auto-Reply</span>
          </div>
        )}
      </div>

      {error && (
        <div className="border-b border-border bg-accent-red/10 px-4 py-2">
          <p className="text-sm text-accent-red">{error}</p>
        </div>
      )}

      {view === "list" ? (
        <>
          <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2">
            <button
              type="button"
              onClick={() => setPlatformFilter("ALL")}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-sm transition-colors",
                platformFilter === "ALL"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              Semua
            </button>
            {PLATFORM_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatformFilter(p)}
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-sm transition-colors",
                  platformFilter === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>

          <div className="px-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari conversations..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Memuat…
              </p>
            ) : filteredConversations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {searchQuery
                  ? "Tidak ada conversations yang cocok."
                  : "Belum ada DM masuk."}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => openConversation(conv)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex-shrink-0">
                      {conv.participantAvatar ? (
                        <img
                          src={conv.participantAvatar}
                          alt={conv.participantUsername}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <span className="text-sm font-medium text-muted-foreground">
                            {conv.participantUsername.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {conv.participantUsername}
                        </span>
                        <span
                          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium text-white"
                          style={{ background: PLATFORM_COLORS[conv.platform] }}
                        >
                          {conv.platform.replace("_PAGE", "")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {conv.lastMessage}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground">
                        {new Date(conv.lastMessageAt).toLocaleDateString(
                          "id-ID",
                          {
                            day: "numeric",
                            month: "short",
                          },
                        )}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada pesan.
              </p>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.isFromBot ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-lg px-4 py-2",
                        msg.isFromBot
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {!msg.isFromBot && (
                        <p className="mb-1 text-xs font-medium opacity-70">
                          {msg.senderUsername}
                        </p>
                      )}
                      <p className="text-sm">{msg.text}</p>
                      <p
                        className={cn(
                          "mt-1 text-xs",
                          msg.isFromBot
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ketik pesan..."
                disabled={sending}
              />
              <Button
                size="sm"
                onClick={sendMessage}
                disabled={!newMessage.trim() || sending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
