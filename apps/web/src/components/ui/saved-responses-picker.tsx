// Panel balasan cepat (saved responses) — pilih template tersimpan untuk isi balasan
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

type SavedResponse = {
  id: string;
  name: string;
  content: string;
};

/**
 * Dropdown balasan cepat + kelola (tambah/hapus) saved responses org.
 * onPick: terapkan isi balasan ke textarea reply.
 */
export function SavedResponsesPicker({
  onPick,
  compact = true,
}: {
  onPick: (content: string) => void;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [form, setForm] = useState({ name: "", content: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["saved-responses"],
    queryFn: () => api.get<{ responses: SavedResponse[] }>("/engagement/saved-responses"),
    staleTime: 5 * 60 * 1000,
  });

  const create = useMutation({
    mutationFn: () => api.post("/engagement/saved-responses", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-responses"] });
      setForm({ name: "", content: "" });
      toast.success("Balasan cepat tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/engagement/saved-responses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-responses"] });
      toast.success("Balasan cepat dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const responses = data?.responses ?? [];

  return (
    <div className="relative">
      <Button
        size="sm"
        variant={compact ? "ghost" : "outline"}
        onClick={() => setOpen((v) => !v)}
        title="Balasan cepat"
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
        {!compact && "Balasan Cepat"}
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl">
          {manageMode ? (
            <div className="space-y-3 p-4">
              <p className="font-semibold text-xs">Balasan Cepat Baru</p>
              <Input
                placeholder="Nama, mis. Terima kasih"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Textarea
                rows={3}
                placeholder="Isi balasan"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => create.mutate()}
                  disabled={create.isPending || !form.name.trim() || !form.content.trim()}
                >
                  {create.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Simpan
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setManageMode(false)}>
                  Kembali
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-[var(--border-light)] border-b px-4 py-2.5">
                <p className="font-semibold text-xs">Balasan Cepat</p>
                <button
                  type="button"
                  onClick={() => setManageMode(true)}
                  className="flex items-center gap-1 text-[var(--accent-gold)] text-xs hover:underline"
                >
                  <Plus className="h-3 w-3" /> Baru
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {isLoading ? (
                  <Loader2 className="mx-auto my-4 h-4 w-4 animate-spin text-[var(--text-muted)]" />
                ) : responses.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[var(--text-muted)] text-xs">
                    Belum ada balasan cepat — buat untuk mempercepat reply
                  </p>
                ) : (
                  responses.map((r) => (
                    <div
                      key={r.id}
                      className="group flex items-start gap-2 border-[var(--border-light)] border-b px-4 py-2.5 last:border-0 hover:bg-[var(--bg-tertiary)]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onPick(r.content);
                          setOpen(false);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="font-medium text-sm">{r.name}</p>
                        <p className="line-clamp-2 text-[var(--text-muted)] text-xs">{r.content}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove.mutate(r.id)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Hapus ${r.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--text-muted)] hover:text-red-500" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
