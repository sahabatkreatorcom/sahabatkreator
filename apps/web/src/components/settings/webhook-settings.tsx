// Panel Webhook keluar — daftar/buat/ubah/hapus endpoint + audit delivery.
//
// Secret signing hanya ditampilkan SEKALI saat buat (sama seperti API key):
// server simpan terenkripsi, tidak pernah dikembalikan.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ShieldAlert, Trash2, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ApiError, api } from "@/lib/api";
import { queryKeys } from "../../lib/query-keys";

type WebhookEndpointRow = {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  revokedAt: string | null;
};

type DeliveryRow = {
  id: string;
  endpointId: string;
  event: string;
  status: string;
  attempt: number;
  responseStatus: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

const EVENT_OPTIONS: { key: string; label: string }[] = [
  { key: "post.published", label: "Post terbit" },
  { key: "post.failed", label: "Post gagal terbit" },
  { key: "post.scheduled", label: "Post dijadwalkan" },
  { key: "render.completed", label: "Render selesai" },
  { key: "render.failed", label: "Render gagal" },
  { key: "media.imported", label: "Media diimpor" },
  { key: "automation.triggered", label: "Automation dipicu" },
];

function eventLabel(key: string): string {
  return EVENT_OPTIONS.find((e) => e.key === key)?.label ?? key;
}

function statusBadge(status: string) {
  if (status === "delivered") return <Badge variant="success">Terkirim</Badge>;
  if (status === "failed") return <Badge variant="destructive">Gagal</Badge>;
  if (status === "retrying") return <Badge variant="warning">Mencoba ulang</Badge>;
  return <Badge variant="outline">Antrian</Badge>;
}

export function WebhookSettings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["post.published"]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.webhookEndpoints,
    queryFn: () => api.get<{ endpoints: WebhookEndpointRow[] }>("/webhook-endpoints"),
  });

  const endpoints: WebhookEndpointRow[] = data?.endpoints ?? [];

  const createMutation = useMutation({
    mutationFn: (input: { name: string; url: string; secret: string; events: string[] }) =>
      api.post("/webhook-endpoints", input),
    onSuccess: () => {
      toast.success("Webhook endpoint dibuat");
      setRevealedSecret(secret);
      setName("");
      setUrl("");
      setSecret("");
      setEvents(["post.published"]);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.webhookEndpoints });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/webhook-endpoints/${id}`),
    onSuccess: () => {
      toast.success("Webhook endpoint dicabut");
      queryClient.invalidateQueries({ queryKey: queryKeys.webhookEndpoints });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  function toggleEvent(key: string) {
    setEvents((prev) => (prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">Webhook keluar</h2>
            <p className="mt-1 text-[var(--text-muted)] text-sm">
              Sahabat Kreator mengirim POST event ke URL kamu, ditandatangani HMAC-SHA256 (header{" "}
              <code className="text-xs">x-sk-signature</code>). Fitur Enterprise.
            </p>
          </div>
          <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "ghost" : "primary"}>
            <Plus className="h-4 w-4" />
            {showForm ? "Batal" : "Tambah endpoint"}
          </Button>
        </div>

        {revealedSecret && (
          <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-light)] p-4">
            <div className="flex items-center gap-2 font-medium text-[var(--warning)] text-sm">
              <ShieldAlert className="h-4 w-4" />
              Simpan secret ini sekarang
            </div>
            <p className="mt-1 text-[var(--text-muted)] text-xs">
              Secret hanya ditampilkan sekali. Tanpa secret, payload tidak bisa diverifikasi.
            </p>
            <code className="mt-2 block overflow-x-auto rounded bg-[var(--bg-tertiary)] p-2 text-xs">
              {revealedSecret}
            </code>
            <Button
              className="mt-2"
              onClick={() => setRevealedSecret(null)}
              size="sm"
              variant="secondary"
            >
              Saya sudah simpan
            </Button>
          </div>
        )}

        {showForm && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({ name, url, secret, events });
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wh-name">Nama</Label>
                <Input
                  id="wh-name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Zapier / Slack #publish"
                  required
                  value={name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wh-url">URL tujuan</Label>
                <Input
                  id="wh-url"
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://hook.zapier.com/..."
                  required
                  type="url"
                  value={url}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-secret">Secret signing</Label>
              <Input
                id="wh-secret"
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Minimal 16 karakter"
                required
                value={secret}
              />
              <p className="text-[var(--text-muted)] text-xs">
                Dipakai menandatangani payload (HMAC-SHA256, header x-sk-signature).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Event yang dilanggan</Label>
              <div className="flex flex-wrap gap-2">
                {EVENT_OPTIONS.map((e) => (
                  <button
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      events.includes(e.key)
                        ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-gold)]"
                    }`}
                    key={e.key}
                    onClick={() => toggleEvent(e.key)}
                    type="button"
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "Menyimpan..." : "Buat endpoint"}
            </Button>
          </form>
        )}

        {endpoints.length === 0 ? (
          <EmptyState
            description="Buat endpoint untuk menerima event post, render, dan media."
            icon={<Webhook className="h-6 w-6" />}
            title="Belum ada webhook endpoint"
          />
        ) : (
          <div className="mt-4 space-y-3">
            {endpoints.map((e) => (
              <div
                className="flex items-start justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--border)] p-4"
                key={e.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{e.name}</span>
                    {!e.isActive && <Badge variant="outline">Nonaktif</Badge>}
                  </div>
                  <p className="mt-1 truncate text-[var(--text-muted)] text-xs">{e.url}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {e.events.map((ev) => (
                      <Badge key={ev} variant="outline">
                        {eventLabel(ev)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  className="text-[var(--error)]"
                  onClick={() => {
                    if (confirm(`Cabut webhook "${e.name}"? Event berhenti dikirim.`)) {
                      revokeMutation.mutate(e.id);
                    }
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <DeliveryLog endpoints={endpoints} />
    </div>
  );
}

function DeliveryLog({ endpoints }: { endpoints: WebhookEndpointRow[] }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.webhookDeliveries,
    queryFn: () => api.get<{ deliveries: DeliveryRow[] }>("/webhook-endpoints/deliveries"),
  });

  const deliveries: DeliveryRow[] = data?.deliveries ?? [];
  const nameById = new Map(endpoints.map((e) => [e.id, e.name]));

  return (
    <div className="card p-6">
      <h3 className="mb-3 font-semibold text-sm">Audit pengiriman (50 terakhir)</h3>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : deliveries.length === 0 ? (
        <p className="py-6 text-center text-[var(--text-muted)] text-sm">
          Belum ada pengiriman. Event akan muncul di sini setelah endpoint dibuat.
        </p>
      ) : (
        <div className="space-y-2">
          {deliveries.map((d) => (
            <div
              className="flex items-center justify-between gap-3 border-[var(--border)] border-b py-2 text-sm last:border-0"
              key={d.id}
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium">{eventLabel(d.event)}</span>
                <span className="ml-2 text-[var(--text-muted)] text-xs">
                  → {nameById.get(d.endpointId) ?? d.endpointId.slice(0, 12)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] text-xs">
                  {d.responseStatus ?? `attempt ${d.attempt}`}
                </span>
                {statusBadge(d.status)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
