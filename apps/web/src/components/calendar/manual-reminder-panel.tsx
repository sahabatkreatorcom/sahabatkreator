// Panel "Post Manual Terjadwal" — list post platform manual berstatus scheduled
// dengan tombol aktifkan pengingat push (M18). Post manual tidak auto-publish,
// jadi pengingat mengingatkan user untuk posting sendiri di platform masing-masing.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { CalendarPostGroup } from "./shared";

type ManualReminderPanelProps = {
  groups: CalendarPostGroup[];
};

/** Ambil post manual terjadwal dari semua group (dedupe per group) */
export function manualScheduledGroups(groups: CalendarPostGroup[]): CalendarPostGroup[] {
  return groups.filter(
    (g) =>
      g.scheduledAt !== null &&
      g.posts.some((p) => p.platform === "manual" && p.status === "scheduled"),
  );
}

export function ManualReminderPanel({ groups }: ManualReminderPanelProps) {
  const queryClient = useQueryClient();
  const manual = manualScheduledGroups(groups);

  // Aktifkan pengingat push 15 menit sebelum tayang (default route)
  const setReminder = useMutation({
    mutationFn: (groupId: string) =>
      api.post<{ ok: true; reminderAt: string }>(`/posts/${groupId}/reminder`, {
        minutesBefore: 15,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
      queryClient.invalidateQueries({ queryKey: ["queue-posts"] });
      toast.success(`Pengingat diaktifkan — push dikirim ${formatDate(data.reminderAt, "short")}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (manual.length === 0) return null;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4 text-[var(--text-muted)]" />
        <h3 className="font-semibold text-sm">Post Manual Terjadwal</h3>
        <Badge variant="secondary" className="text-[10px]">
          {manual.length}
        </Badge>
      </div>
      <p className="mb-3 text-[var(--text-muted)] text-xs">
        Post platform manual tidak dipublikasi otomatis — aktifkan pengingat agar kamu dapat push
        notification sebelum waktu tayang.
      </p>
      <div className="space-y-2">
        {manual.map((group) => {
          const reminderActive = group.reminderAt !== null;
          const usernames = Array.from(
            new Set(
              group.posts
                .filter((p) => p.platform === "manual")
                .map((p) => p.username)
                .filter((u): u is string => Boolean(u)),
            ),
          );
          return (
            <div
              key={group.id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-tertiary)]/50 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{group.content || "(tanpa caption)"}</p>
                <p className="mt-0.5 truncate text-[var(--text-muted)] text-xs">
                  {usernames.length > 0 ? `@${usernames.join(", @")} · ` : ""}
                  {formatDate(group.scheduledAt)}
                </p>
              </div>
              {reminderActive ? (
                <Badge variant="success" className="shrink-0 gap-1">
                  <BellRing className="h-3 w-3" />
                  Pengingat aktif
                </Badge>
              ) : (
                <button
                  type="button"
                  onClick={() => setReminder.mutate(group.id)}
                  disabled={setReminder.isPending && setReminder.variables === group.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 font-medium text-[var(--text-secondary)] text-xs transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] disabled:opacity-50"
                  title="Dapatkan push notification 15 menit sebelum tayang"
                >
                  {setReminder.isPending && setReminder.variables === group.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  )}
                  Ingatkan saya
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
