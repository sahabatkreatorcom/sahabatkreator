// Halaman Media — pustaka file: folder, upload, import URL, edit metadata, hapus
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FolderPlus,
  Image as ImageIcon,
  Link as LinkIcon,
  ListChecks,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { generateVideoThumbnail } from "@/lib/media-thumbnail";
import { cn } from "@/lib/utils";

type MediaItem = {
  id: string;
  name: string;
  url: string;
  type: "image" | "video" | "audio";
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
  folderId: string | null;
  createdAt: string;
  /** Thumbnail video (JPEG frame) — null bila bukan video/tidak tersedia */
  thumbnailUrl: string | null;
};

type Folder = { id: string; name: string };

type EditState = {
  item: MediaItem;
  name: string;
  altText: string;
  folderId: string | null;
};

export function MediaPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [uploading, setUploading] = useState(0);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = semua
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  // Mode bulk select — Set berisi id media yang dicentang
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Deep link ?upload=1 (dari command palette) → buka dialog upload otomatis
  const autoUpload = searchParams.get("upload") === "1";

  const mediaListKey = ["media", activeFolder] as const;

  const { data, isLoading } = useQuery({
    queryKey: mediaListKey,
    queryFn: () =>
      api.get<{ items: MediaItem[]; storageConfigured: boolean }>(
        activeFolder ? `/media?folderId=${activeFolder}` : "/media",
      ),
  });

  const { data: foldersData } = useQuery({
    queryKey: ["media-folders"],
    queryFn: () => api.get<{ folders: Folder[] }>("/media/folders"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["media"] });
    queryClient.invalidateQueries({ queryKey: ["media-folders"] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const thumbnail = await generateVideoThumbnail(file);
      if (thumbnail) formData.append("thumbnail", thumbnail, "thumbnail.jpg");
      return api.upload<{ media: MediaItem }>("/media/upload", formData);
    },
    onSuccess: () => {
      invalidate();
      toast.success("File berhasil diupload");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importFromUrl = useMutation({
    mutationFn: (url: string) =>
      api.post<{ media: MediaItem }>("/media/import", {
        url,
        folderId: activeFolder,
      }),
    onSuccess: () => {
      invalidate();
      setShowImport(false);
      setImportUrl("");
      toast.success("Media berhasil diimport");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createFolder = useMutation({
    mutationFn: (name: string) => api.post("/media/folders", { name }),
    onSuccess: () => {
      invalidate();
      setNewFolderName("");
      toast.success("Folder dibuat");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFolder = useMutation({
    mutationFn: (id: string) => api.delete(`/media/folders/${id}`),
    onSuccess: () => {
      invalidate();
      if (activeFolder) setActiveFolder(null);
      toast.success("Folder dihapus — media dipindah ke Semua Media");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: (s: EditState) =>
      api.patch(`/media/${s.item.id}`, {
        name: s.name,
        altText: s.altText || null,
      }),
    onSuccess: (_d, s) => {
      // Pindah folder bila berubah
      if (s.folderId !== s.item.folderId) {
        api
          .post("/media/move", { ids: [s.item.id], folderId: s.folderId })
          .then(() => invalidate())
          .catch(() => toast.error("Gagal memindah folder"));
      } else {
        invalidate();
      }
      setEditing(null);
      toast.success("Perubahan tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Generate alt text via AI (1 kredit) — isi hasil ke field altText
  const generateAltText = useMutation({
    mutationFn: (mediaId: string) =>
      api.post<{ altText: string; credits: { used: number; limit: number } }>("/ai/alt-text", {
        mediaId,
      }),
    onSuccess: (data) => {
      // Isi hasil ke field (enable edit bila field terkunci/kosong)
      setEditing((s) => (s ? { ...s, altText: data.altText } : s));
      toast.success("Alt text dihasilkan AI — periksa lalu simpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/media/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("File dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------------------------------------------------------------------------
  // Bulk select & bulk delete — checkbox overlay per item, hapus massal dengan
  // Promise.allSettled lalu invalidate + toast ringkasan hasil.
  // ---------------------------------------------------------------------------

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  /** Pilih semua media yang tampil di folder aktif */
  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const allSelected = items.every((m) => prev.has(m.id));
      if (allSelected) return new Set();
      return new Set(items.map((m) => m.id));
    });
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Hapus ${count} file terpilih? Tindakan ini tidak bisa dibatalkan.`)) {
      return;
    }

    setBulkDeleting(true);
    const results = await Promise.allSettled(
      Array.from(selectedIds).map((id) => api.delete(`/media/${id}`)),
    );
    setBulkDeleting(false);

    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    invalidate();
    exitSelectMode();

    if (failed === 0) {
      toast.success(`${succeeded} file berhasil dihapus`);
    } else if (succeeded === 0) {
      toast.error(`Semua ${failed} file gagal dihapus`);
    } else {
      toast.warning(`${succeeded} berhasil, ${failed} gagal dihapus`);
    }
  }

  const items = data?.items ?? [];
  const folders = foldersData?.folders ?? [];
  const totalSize = items.reduce((sum, m) => sum + m.sizeBytes, 0);

  // Auto-buka dialog upload bila datang dari deep link ?upload=1
  // (sekali saja — param dibersihkan setelah trigger)
  useEffect(() => {
    if (!autoUpload) return;
    setSearchParams({}, { replace: true });
    if (data?.storageConfigured) {
      fileInputRef.current?.click();
    } else {
      toast.error("Upload belum tersedia — storage belum dikonfigurasi");
    }
  }, [autoUpload, data?.storageConfigured, setSearchParams]);

  // Buang id terpilih yang tidak lagi tampil (mis. pindah folder) agar counter akurat
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(items.map((m) => m.id));
      const next = new Set(Array.from(prev).filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  async function handleFiles(files: FileList) {
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        await upload.mutateAsync(file);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Pustaka Media</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            {selectMode ? (
              <>
                Mode pilih aktif —{" "}
                <span className="font-semibold text-[var(--accent-gold)]">
                  {selectedIds.size} dipilih
                </span>{" "}
                dari {items.length} file
              </>
            ) : (
              <>
                {items.length} file · {formatBytes(totalSize)} terpakai
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {selectMode ? (
            <>
              <Button variant="ghost" onClick={exitSelectMode} disabled={bulkDeleting}>
                <X className="h-4 w-4" />
                Batal
              </Button>
              <Button
                variant="outline"
                onClick={toggleSelectAll}
                disabled={bulkDeleting || items.length === 0}
              >
                <Check className="h-4 w-4" />
                {items.length > 0 && selectedIds.size === items.length
                  ? "Kosongkan"
                  : "Pilih Semua"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleBulkDelete()}
                disabled={selectedIds.size === 0 || bulkDeleting}
              >
                {bulkDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Hapus Terpilih ({selectedIds.size})
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setSelectMode(true)}
                disabled={items.length === 0}
                title="Pilih beberapa file untuk aksi massal"
              >
                <ListChecks className="h-4 w-4" />
                Pilih
              </Button>
              <Button variant="outline" onClick={() => setShowImport(true)}>
                <LinkIcon className="h-4 w-4" />
                Import URL
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={!data?.storageConfigured || uploading > 0}
              >
                {uploading > 0 ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading > 0 ? `Mengupload (${uploading})` : "Upload Media"}
              </Button>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/wav"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {!data?.storageConfigured && (
        <div className="rounded-[var(--radius-lg)] border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm">
          Storage R2 belum dikonfigurasi. Hubungi administrator untuk mengaktifkan upload media.
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar folder */}
        <div className="w-48 shrink-0 space-y-1">
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors",
              activeFolder === null
                ? "bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]",
            )}
          >
            <ImageIcon className="h-4 w-4" />
            Semua Media
          </button>
          {folders.map((f) => (
            <div key={f.id} className="group relative">
              <button
                type="button"
                onClick={() => setActiveFolder(f.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors",
                  activeFolder === f.id
                    ? "bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]",
                )}
              >
                <FolderPlus className="h-4 w-4" />
                <span className="truncate">{f.name}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(`Hapus folder "${f.name}"? Media di dalamnya dipindah ke Semua Media.`)
                  ) {
                    removeFolder.mutate(f.id);
                  }
                }}
                className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded p-1 text-[var(--text-muted)] hover:text-[var(--error)] group-hover:block"
                aria-label={`Hapus folder ${f.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Buat folder baru */}
          <div className="mt-3 flex gap-1">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim()) {
                  createFolder.mutate(newFolderName.trim());
                }
              }}
              placeholder="Folder baru…"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              disabled={!newFolderName.trim() || createFolder.isPending}
              onClick={() => createFolder.mutate(newFolderName.trim())}
            >
              {createFolder.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderPlus className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Grid media */}
        <div className="min-w-0 flex-1">
          {items.length === 0 ? (
            <EmptyState
              icon={<ImageIcon className="h-6 w-6" />}
              title={activeFolder ? "Folder ini kosong" : "Pustaka masih kosong"}
              description="Upload foto dan video, atau import dari URL."
              action={
                data?.storageConfigured ? (
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                    Upload Media
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {items.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`card group overflow-hidden p-0 ${
                      selectMode && isSelected ? "ring-2 ring-[var(--accent-gold)]" : ""
                    }`}
                  >
                    <div className="relative aspect-square bg-[var(--bg-tertiary)]">
                      {item.mimeType.startsWith("image/") ? (
                        <img
                          src={item.url}
                          alt={item.altText ?? item.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.altText ?? item.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--text-muted)]">
                          <ImageIcon className="h-8 w-8" />
                          <span className="text-xs">{item.mimeType.split("/")[0]}</span>
                        </div>
                      )}

                      {/* Mode pilih: seluruh kartu jadi toggle checkbox */}
                      {selectMode && (
                        <button
                          type="button"
                          onClick={() => toggleSelected(item.id)}
                          className="absolute inset-0 h-full w-full cursor-pointer"
                          aria-label={
                            isSelected ? `Batal pilih ${item.name}` : `Pilih ${item.name}`
                          }
                          aria-pressed={isSelected}
                        />
                      )}

                      {/* Checkbox overlay kiri atas */}
                      {selectMode && (
                        <span
                          className={`pointer-events-none absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-md border-2 shadow ${
                            isSelected
                              ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-white"
                              : "border-white/80 bg-black/30 text-transparent"
                          }`}
                        >
                          <Check className="h-4 w-4" />
                        </span>
                      )}

                      {/* Aksi hover — disembunyikan saat mode pilih */}
                      {!selectMode && (
                        <div className="absolute inset-x-0 top-0 hidden justify-end gap-1 p-2 group-hover:flex">
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                item,
                                name: item.name,
                                altText: item.altText ?? "",
                                folderId: item.folderId,
                              })
                            }
                            className="rounded-full bg-[var(--bg-secondary)] p-1.5 text-[var(--text-primary)] shadow"
                            aria-label={`Edit ${item.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove.mutate(item.id)}
                            className="rounded-full bg-red-500 p-1.5 text-white shadow"
                            aria-label={`Hapus ${item.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate font-medium text-xs" title={item.name}>
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                        {formatBytes(item.sizeBytes)} · {formatDate(item.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal import URL */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Import dari URL</h2>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="import-url">URL file (gambar/video/audio)</Label>
                <Input
                  id="import-url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://contoh.com/foto.jpg"
                />
              </div>
              <p className="text-[var(--text-muted)] text-xs">
                File diunduh ke storage R2 Anda (maks 100 MB). Pastikan Anda punya hak untuk memakai
                file tersebut.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowImport(false)}>
                  Batal
                </Button>
                <Button
                  disabled={!importUrl.trim() || importFromUrl.isPending}
                  onClick={() => importFromUrl.mutate(importUrl.trim())}
                >
                  {importFromUrl.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LinkIcon className="h-4 w-4" />
                  )}
                  Import
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal edit media */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Edit Media</h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {editing.item.mimeType.startsWith("image/") && (
                <img
                  src={editing.item.url}
                  alt={editing.altText}
                  className="max-h-48 w-full rounded-[var(--radius-md)] object-cover"
                />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Nama file</Label>
                <Input
                  id="edit-name"
                  value={editing.name}
                  onChange={(e) => setEditing((s) => (s ? { ...s, name: e.target.value } : s))}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-alt">Alt text (aksesibilitas & SEO)</Label>
                  <button
                    type="button"
                    onClick={() => generateAltText.mutate(editing.item.id)}
                    disabled={generateAltText.isPending}
                    className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] disabled:opacity-50"
                    title="Generate alt text dengan AI (1 kredit)"
                  >
                    {generateAltText.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    AI
                  </button>
                </div>
                <Input
                  id="edit-alt"
                  value={editing.altText}
                  onChange={(e) => setEditing((s) => (s ? { ...s, altText: e.target.value } : s))}
                  placeholder="Deskripsi singkat isi gambar"
                />
                <p className="text-[11px] text-[var(--text-muted)]">
                  Deskripsi untuk pembaca layar & SEO. Klik "AI" untuk saran otomatis (1 kredit).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-folder">Folder</Label>
                <select
                  id="edit-folder"
                  value={editing.folderId ?? ""}
                  onChange={(e) =>
                    setEditing((s) => (s ? { ...s, folderId: e.target.value || null } : s))
                  }
                  className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 text-sm"
                >
                  <option value="">Semua Media (root)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Batal
                </Button>
                <Button disabled={saveEdit.isPending} onClick={() => saveEdit.mutate(editing)}>
                  {saveEdit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
