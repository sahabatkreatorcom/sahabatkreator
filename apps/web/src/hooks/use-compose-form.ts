// Logic form Compose: state editor, draft autosave, upload/resize media,
// prefill dari halaman tren, validasi, cek konflik jadwal, dan submit post.
// Halaman (compose.tsx) tinggal merender JSX memakai hook ini.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { ScheduleMode } from "@/components/compose/compose-actions";
import {
  type Account,
  defaultScheduledAt,
  type MediaItem,
  type RESIZE_PRESETS,
  type SoundTrack,
} from "@/components/compose/compose-types";
import type { EditableMedia } from "@/components/compose/image-editor-modal";
import {
  buildPlatformSettings,
  type SettingsState,
} from "@/components/compose/platform-settings-panel";
import { validatePost } from "@/components/compose/validation-panel";
import { useComposeDraft } from "@/hooks/use-compose-draft";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { meQueryOptions } from "@/layouts/require-auth";
import { api } from "@/lib/api";
import { generateVideoThumbnail } from "@/lib/media-thumbnail";

// ---- Tipe Web App Launch Handler (file_handlers PWA) — belum ada di lib.dom ----
declare global {
  interface LaunchParams {
    files?: FileSystemFileHandle[];
  }
  interface LaunchQueue {
    setConsumer(consumer: (launchParams: LaunchParams) => void): void;
  }
  interface Window {
    launchQueue?: LaunchQueue;
  }
}

/** Platform yang diterima endpoint AI (zod enum di server) — selain ini di-fallback */
const AI_PLATFORMS = new Set([
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
  // Halaman company LinkedIn — endpoint AI punya style sendiri untuk platform ini
  "linkedin_org",
  "pinterest",
  "threads",
  "x",
]);

/** Konflik jadwal dari endpoint /posts/conflicts */
type ScheduleConflict = {
  socialAccountId: string;
  platform: string;
  accountUsername: string;
  postA: { id: string; caption: string; scheduledAt: string };
  postB: { id: string; caption: string; scheduledAt: string };
  deltaMinutes: number;
};

/** Parse string hashtag → array tag bersih tanpa '#' dan duplikat */
function parseTags(s: string): string[] {
  return s
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
}

export function useComposeForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState("");
  // Sound terpilih untuk konten video (TikTok/Reels)
  const [soundTrack, setSoundTrack] = useState<SoundTrack | null>(null);
  // Produk yang di-tag ke konten
  const [productIds, setProductIds] = useState<string[]>([]);
  // Variasi caption per platform — accountId → custom caption (kosong = caption utama)
  const [variations, setVariations] = useState<Record<string, string>>({});
  // Variasi hashtag per platform — accountId → hashtag custom (kosong = hashtag utama)
  const [hashtagVariations, setHashtagVariations] = useState<Record<string, string>>({});
  // Pengaturan khusus per platform (first comment, TikTok privacy, YouTube, dll)
  const [platformSettings, setPlatformSettings] = useState<Record<string, SettingsState>>({});
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("schedule");
  const [scheduledAt, setScheduledAt] = useState(() => defaultScheduledAt());
  // Media yang sedang diedit di image editor modal
  const [editingMedia, setEditingMedia] = useState<EditableMedia | null>(null);

  const { data: meData } = useQuery(meQueryOptions);
  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<{ accounts: Account[] }>("/accounts"),
  });
  const { data: mediaData } = useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<{ items: MediaItem[] }>("/media"),
  });

  const accounts = (accountsData?.accounts ?? []).filter((a) => a.isConnected);
  const mediaItems = mediaData?.items ?? [];
  // Urutan media mengikuti mediaIds (urutan lampiran), bukan urutan katalog —
  // agar reorder (geser kiri/kanan) terlihat langsung di thumbnail & preview.
  const selectedMedia = mediaIds
    .map((id) => mediaItems.find((m) => m.id === id))
    .filter((m): m is MediaItem => m !== undefined);

  // Pre-select akun dari query param (sekali, agar draft restore tidak menimpa)
  const preselect = params.get("account");
  const preselectRef = useRef(preselect);
  useEffect(() => {
    if (!preselect || preselectRef.current === null) return;
    preselectRef.current = null;
    setSelectedAccounts([preselect]);
  }, [preselect]);

  // Draft autosave + restore (per org aktif) — mencakup seluruh state editor
  const orgId = meData?.organization?.id ?? null;
  const { savedAt, restoredDraft, clearDraft, saveNow } = useComposeDraft(
    orgId,
    {
      content,
      hashtags,
      mediaIds,
      scheduledAt: scheduleMode === "schedule" ? scheduledAt : null,
      accountIds: selectedAccounts,
      variations,
      hashtagVariations,
      soundTrack: soundTrack ? { id: soundTrack.id, title: soundTrack.name } : null,
      productIds,
      platformSettings,
    },
    {
      // User membuang draft → reset editor ke kondisi awal
      onDiscard: clearAll,
    },
  );

  // Pre-fill konten dari navigate state (mis. "Pakai ide" dari halaman tren).
  // State dibersihkan via navigate replace agar refresh/back tidak mengisi ulang.
  const prefilledContent = (location.state as { content?: string } | null)?.content ?? null;
  // Flag "prefill aktif" — mencegah restore draft lokal menimpa ide yang
  // baru saja dipilih user dari halaman tren.
  const prefillActive = prefilledContent !== null;

  useEffect(() => {
    if (!prefilledContent) return;
    setContent(prefilledContent);
    navigate(location.pathname, { replace: true, state: null });
  }, [prefilledContent, location.pathname, navigate]);

  // Terapkan draft yang dipulihkan ke state compose (sekali) — kecuali saat
  // user baru tiba dengan prefill dari halaman tren (ide menang atas draft)
  useEffect(() => {
    if (!restoredDraft || prefillActive) return;
    if (restoredDraft.content.trim() !== "") setContent(restoredDraft.content);
    setHashtags(restoredDraft.hashtags);
    if (restoredDraft.mediaIds.length > 0) setMediaIds(restoredDraft.mediaIds);
    if (restoredDraft.scheduledAt) setScheduledAt(restoredDraft.scheduledAt);
    if (restoredDraft.accountIds.length > 0) {
      setSelectedAccounts(restoredDraft.accountIds);
    }
    if (Object.keys(restoredDraft.variations).length > 0) {
      setVariations(restoredDraft.variations);
    }
    if (Object.keys(restoredDraft.hashtagVariations).length > 0) {
      setHashtagVariations(restoredDraft.hashtagVariations);
    }
    if (restoredDraft.productIds.length > 0) setProductIds(restoredDraft.productIds);
    if (Object.keys(restoredDraft.platformSettings).length > 0) {
      setPlatformSettings(restoredDraft.platformSettings);
    }
    // Sound track hanya id yang tersimpan — SoundPicker me-render ulang
    // judul dari server via id (meta minimal cukup untuk submit)
    if (restoredDraft.soundTrack) {
      setSoundTrack({
        id: restoredDraft.soundTrack.id,
        name: restoredDraft.soundTrack.title ?? "Draft sound",
        url: "",
        durationSeconds: 0,
        waveformData: null,
        isFeatured: false,
        category: null,
      });
    }
  }, [restoredDraft, prefillActive]);

  const createPost = useMutation({
    mutationFn: (payload: unknown) => api.post("/posts", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
      // Post sukses dibuat — draft tidak lagi diperlukan
      clearDraft();
      // Izinkan navigasi ke calendar tanpa konfirmasi (state belum re-render)
      allowNextNavigation();
      toast.success("Konten berhasil disimpan");
      navigate("/calendar");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Guard perubahan belum tersimpan — cegah navigasi & reload.
  // hasChanges = konten terisi atau ada media; nonaktif saat submit pending.
  const hasChanges = content.trim() !== "" || mediaIds.length > 0;
  const { allowNext: allowNextNavigation } = useUnsavedChanges(hasChanges && !createPost.isPending);

  const uploadMedia = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      // Thumbnail video client-side (frame ~10%) — null bila gagal decode
      const thumbnail = await generateVideoThumbnail(file);
      if (thumbnail) formData.append("thumbnail", thumbnail, "thumbnail.jpg");
      return api.upload<{ media: MediaItem }>("/media/upload", formData);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      setMediaIds((ids) => [...ids, data.media.id]);
      toast.success("Media diupload");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // File handler PWA — file dibuka via "Buka dengan Sahabat Kreator" dari OS
  // (manifest file_handlers) langsung di-upload & dilampirkan ke compose,
  // memakai alur upload yang sama dengan input file.
  const uploadMediaRef = useRef(uploadMedia);
  uploadMediaRef.current = uploadMedia;
  useEffect(() => {
    if (!("launchQueue" in window) || !window.launchQueue) return;
    window.launchQueue.setConsumer(async (launchParams) => {
      if (!launchParams.files?.length) return;
      for (const handle of launchParams.files) {
        try {
          const file = await handle.getFile();
          uploadMediaRef.current.mutate(file);
        } catch {
          toast.error("Gagal membuka file yang dibagikan");
        }
      }
    });
  }, []);

  // Resize gambar ke dimensi platform via sharp di server
  const resizeMedia = useMutation({
    mutationFn: (vars: { mediaId: string; preset: (typeof RESIZE_PRESETS)[number] }) =>
      api.post<{ media: MediaItem }>("/media/resize", {
        mediaId: vars.mediaId,
        platform: vars.preset.platform,
        ...("postType" in vars.preset ? { postType: vars.preset.postType } : {}),
      }),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      // Ganti media lama dengan hasil resize di compose state
      setMediaIds((ids) => ids.map((id) => (id === vars.mediaId ? data.media.id : id)));
      toast.success(`Media di-resize ke ${vars.preset.label}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  }

  /** Cek konflik jadwal (±10 menit di akun yang sama) sebelum simpan.
   * Hanya peringatan — user boleh tetap lanjut. Return false bila user batal. */
  async function confirmScheduleConflict(): Promise<boolean> {
    if (scheduleMode !== "schedule" || !scheduledAt) return true;
    const target = new Date(scheduledAt);
    if (Number.isNaN(target.getTime())) return true;

    const from = new Date(target.getTime() - 15 * 60_000).toISOString();
    const to = new Date(target.getTime() + 15 * 60_000).toISOString();
    try {
      const data = await api.get<{ conflicts: ScheduleConflict[] }>(
        `/posts/conflicts?from=${from}&to=${to}&candidateAt=${target.toISOString()}&accountIds=${selectedAccounts.join(",")}`,
      );
      const hits = (data.conflicts ?? []).filter((c) =>
        selectedAccounts.includes(c.socialAccountId),
      );
      const hit = hits[0];
      if (!hit) return true;

      // Sisi post lain = pasangan yang bukan post kandidat (id "")
      const other = hit.postA.id === "" ? hit.postB : hit.postA;
      const time = new Date(other.scheduledAt).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return window.confirm(
        `Post lain sudah dijadwal pada ${time} di akun @${hit.accountUsername} (selisih ${hit.deltaMinutes} menit). Tetap simpan?`,
      );
    } catch {
      // Endpoint tidak tersedia / gagal — jangan blokir penyimpanan
      return true;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitPost();
  }

  async function submitPost() {
    if (selectedAccounts.length === 0) {
      toast.error("Pilih minimal satu akun social media");
      return;
    }
    if (!content.trim() && mediaIds.length === 0) {
      toast.error("Tulis konten atau lampirkan media");
      return;
    }

    // Peringatan konflik jadwal — user boleh lanjut (return false = batal simpan)
    if (!(await confirmScheduleConflict())) return;

    const tags = parseTags(hashtags);

    createPost.mutate({
      content,
      // Mode "Sekarang" kirim waktu saat ini (bukan null) agar post langsung
      // berstatus scheduled + job publish delay-0 — null hanya membuat draft.
      scheduledAt:
        scheduleMode === "now"
          ? new Date().toISOString()
          : scheduleMode === "schedule"
            ? new Date(scheduledAt).toISOString()
            : null,
      audioTrackId: soundTrack?.id ?? null,
      productIds,
      items: selectedAccounts.map((socialAccountId) => {
        const variation = variations[socialAccountId]?.trim();
        const customTags = hashtagVariations[socialAccountId]?.trim();
        const account = accounts.find((a) => a.id === socialAccountId);
        const settings = platformSettings[socialAccountId];
        return {
          socialAccountId,
          // Custom caption per platform bila diisi — fallback caption utama
          content: variation || content,
          // Hashtag custom per platform bila diisi — fallback hashtag utama
          hashtags: customTags ? parseTags(customTags) : tags,
          mediaIds,
          // First comment (IG/FB/Threads/YT/Bluesky/LinkedIn) — dikirim bila diisi
          firstComment: settings?.firstComment?.trim() || undefined,
          // Pengaturan khusus platform (TikTok privacy, YouTube title, dll)
          platformSettings: account ? buildPlatformSettings(account.platform, settings) : undefined,
        };
      }),
    });
  }

  // ---- Upload via paste & drag-drop ----
  /** Paste gambar/video dari clipboard (mis. screenshot) di area caption */
  function handleClipboardPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (files.length === 0) return;
    e.preventDefault();
    for (const file of files) uploadMedia.mutate(file);
    toast.success(`${files.length} media ditempel dari clipboard`);
  }

  /** Highlight saat file di-drag ke atas area editor */
  const [isDragOver, setIsDragOver] = useState(false);

  /** Props drag-and-drop untuk area editor — file di-drop langsung di-upload */
  const dropZoneProps = {
    onDragOver: (e: React.DragEvent) => {
      if (Array.from(e.dataTransfer.types).includes("Files")) {
        e.preventDefault();
        setIsDragOver(true);
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      // Hanya reset saat keluar dari container (bukan ke child element)
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
      );
      if (files.length === 0) return;
      e.preventDefault();
      for (const file of files) uploadMedia.mutate(file);
      toast.success(`${files.length} media ditambahkan`);
    },
  };

  /** Ganti media hasil edit image editor di compose state */
  function replaceEditedMedia(newMedia: { id: string }) {
    queryClient.invalidateQueries({ queryKey: ["media"] });
    if (editingMedia) {
      setMediaIds((ids) => ids.map((id) => (id === editingMedia.id ? newMedia.id : id)));
    }
    setEditingMedia(null);
  }

  /** Lepas media dari lampiran compose (file di server tetap tersimpan) */
  function removeMedia(mediaId: string) {
    setMediaIds((ids) => ids.filter((id) => id !== mediaId));
  }

  /** Geser urutan lampiran media satu posisi ke kiri (-1) / kanan (+1) */
  function reorderMedia(mediaId: string, direction: -1 | 1) {
    setMediaIds((ids) => {
      const index = ids.indexOf(mediaId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= ids.length) return ids;
      const next = [...ids];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
  }

  /** Reset seluruh form ke kondisi awal — dipakai tombol "Bersihkan" & buang draft */
  function clearAll() {
    // Hapus draft di localStorage agar refresh tidak memulihkan ulang —
    // tanpa ini hanya state React yang ter-reset, draft lama tetap tersimpan.
    clearDraft();
    setContent("");
    setHashtags("");
    setMediaIds([]);
    setSoundTrack(null);
    setProductIds([]);
    setVariations({});
    setHashtagVariations({});
    setPlatformSettings({});
    setScheduledAt(defaultScheduledAt());
    setSelectedAccounts(preselect ? [preselect] : []);
  }

  // Platform dominan untuk konteks AI (platform akun pertama terpilih).
  // instagram_standalone memakai konteks instagram; platform di luar dukungan
  // AI (bluesky/google_business/manual) di-fallback agar tidak ditolak schema.
  const rawAiPlatform = accounts.find((a) => a.id === selectedAccounts[0])?.platform ?? "instagram";
  const aiPlatform = AI_PLATFORMS.has(rawAiPlatform) ? rawAiPlatform : "instagram";

  // Akun yang dipilih (objek penuh) — untuk preview & validasi
  const selectedAccountObjects = accounts.filter((a) => selectedAccounts.includes(a.id));

  // Validasi client-side — error memblokir tombol publish
  const validationIssues = validatePost({
    content,
    hashtags,
    variations,
    platformSettings,
    accounts: selectedAccountObjects.map((a) => ({
      id: a.id,
      platform: a.platform,
      username: a.username,
    })),
    media: selectedMedia,
    scheduledAt: scheduleMode === "schedule" ? scheduledAt : null,
    scheduleMode,
  });
  const hasValidationErrors = validationIssues.some((issue) => issue.severity === "error");

  // ---- Keyboard shortcut ----
  // Ctrl/Cmd+Enter → submit post; Ctrl/Cmd+S → simpan draft eksplisit.
  // Nilai terkini diakses via ref agar listener hanya dipasang sekali.
  const hasValidationErrorsRef = useRef(hasValidationErrors);
  hasValidationErrorsRef.current = hasValidationErrors;
  const submitPostRef = useRef(submitPost);
  submitPostRef.current = submitPost;
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (!hasValidationErrorsRef.current) void submitPostRef.current();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        const saved = saveNowRef.current();
        if (saved) toast.success("Draft disimpan");
        else toast.error("Belum ada konten untuk disimpan");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Waktu autosave terakhir untuk indikator "Tersimpan HH:MM"
  const savedAtLabel = savedAt
    ? new Date(savedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : null;

  return {
    // state editor
    content,
    setContent,
    hashtags,
    setHashtags,
    selectedAccounts,
    toggleAccount,
    mediaIds,
    selectedMedia,
    soundTrack,
    setSoundTrack,
    productIds,
    setProductIds,
    variations,
    setVariations,
    hashtagVariations,
    setHashtagVariations,
    platformSettings,
    setPlatformSettings,
    scheduleMode,
    setScheduleMode,
    scheduledAt,
    setScheduledAt,
    editingMedia,
    setEditingMedia,
    // data
    accounts,
    aiPlatform,
    selectedAccountObjects,
    // mutasi
    createPost,
    uploadMedia,
    resizeMedia,
    // aksi
    handleSubmit,
    replaceEditedMedia,
    removeMedia,
    reorderMedia,
    setMediaIds,
    clearAll,
    saveNow,
    handleClipboardPaste,
    dropZoneProps,
    isDragOver,
    // indikator
    savedAtLabel,
    validationIssues,
    hasValidationErrors,
    hasChanges,
  };
}
