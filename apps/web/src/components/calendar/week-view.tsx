// Tampilan mingguan kalender — 7 kolom × slot jam + drag-drop antar slot jam
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { StickyNote } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { ExternalPostChip } from "./external-post-chip";
import {
  type CalendarNote,
  type CalendarPostGroup,
  DAYS_ID,
  formatTimeId,
  startOfWeek,
  toLocalISODate,
  withDragIndexes,
} from "./shared";

/** Slot jam yang ditampilkan: 06:00–23:00 tiap 1 jam */
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

type WeekViewProps = {
  cursor: Date;
  postsByDate: Map<string, CalendarPostGroup[]>;
  notesByDate: Map<string, CalendarNote[]>;
  todayKey: string;
  /** Id post group yang terlibat konflik jadwal (ring amber) */
  conflictedGroupIds: Set<string>;
  onAddNote: (dateKey: string) => void;
  onEditNote: (note: CalendarNote) => void;
  onReschedule: (groupId: string, dateKey: string, hour: number) => void;
};

export function WeekView({
  cursor,
  postsByDate,
  notesByDate,
  todayKey,
  conflictedGroupIds,
  onAddNote,
  onEditNote,
  onReschedule,
}: WeekViewProps) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  function handleDrop(result: DropResult) {
    if (!result.destination) return;
    const dest = result.destination.droppableId; // "slot:2026-09-12:14"
    const m = dest.match(/^slot:(\d{4}-\d{2}-\d{2}):(\d{2})$/);
    if (!m) return;
    const groupId = result.draggableId.replace("post:", "");
    if (!groupId) return;
    onReschedule(groupId, m[1]!, Number(m[2]));
  }

  return (
    <DragDropContext onDragEnd={handleDrop}>
      <div className="card overflow-hidden p-0">
        {/* Header hari */}
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-[var(--border-light)] border-b bg-[var(--bg-secondary)]">
          <div />
          {days.map((day, i) => {
            const key = toLocalISODate(day);
            const isToday = key === todayKey;
            return (
              <div key={key} className="px-2 py-2 text-center">
                <p className="font-medium text-[var(--text-muted)] text-xs">{DAYS_ID[i]}</p>
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full font-medium text-xs ${
                    isToday ? "bg-gradient text-white" : "text-[var(--text-secondary)]"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Baris catatan sepanjang minggu */}
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-[var(--border-light)] border-b">
          <div className="flex items-center justify-center text-[10px] text-[var(--text-muted)]">
            Catatan
          </div>
          {days.map((day) => {
            const key = toLocalISODate(day);
            const dayNotes = notesByDate.get(key) ?? [];
            return (
              <div
                key={key}
                className="group min-h-10 space-y-1 border-[var(--border-light)] border-r p-1"
              >
                {dayNotes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onEditNote(n)}
                    className="block w-full truncate rounded border-l-2 bg-[var(--bg-tertiary)] px-1 py-0.5 text-left text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]"
                    style={{ borderLeftColor: n.color ?? "var(--accent-pink)" }}
                    title={n.title}
                  >
                    {n.title}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onAddNote(key)}
                  className="hidden rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] group-hover:block"
                  aria-label="Tambah catatan"
                >
                  <StickyNote className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Grid jam */}
        <div className="max-h-[65vh] overflow-y-auto">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-[var(--border-light)] border-b"
            >
              <div className="px-2 py-1 text-right text-[10px] text-[var(--text-muted)]">
                {String(hour).padStart(2, "0")}:00
              </div>
              {days.map((day) => {
                const key = toLocalISODate(day);
                const isToday = key === todayKey;
                // Post di jam ini (jam mulai cocok)
                const hourPosts = (postsByDate.get(key) ?? []).filter((g) => {
                  if (!g.scheduledAt) return false;
                  return new Date(g.scheduledAt).getHours() === hour;
                });

                return (
                  <Droppable key={key} droppableId={`slot:${key}:${String(hour).padStart(2, "0")}`}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-12 border-[var(--border-light)] border-r p-0.5 ${
                          isToday ? "bg-[var(--accent-gold-light)]/10" : ""
                        } ${snapshot.isDraggingOver ? "bg-[var(--accent-gold-light)]/40" : ""}`}
                      >
                        {withDragIndexes(hourPosts).map(({ g, dragIndex }) =>
                          dragIndex === null ? (
                            <ExternalPostChip key={g.id} group={g} size="xs" />
                          ) : (
                            <Draggable key={g.id} draggableId={`post:${g.id}`} index={dragIndex}>
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  title={g.content || "(tanpa caption)"}
                                  className={`mb-0.5 flex items-center gap-1 rounded bg-[var(--accent-gold-light)] px-1 py-0.5 text-[10px] text-[var(--text-primary)] ${
                                    dragSnapshot.isDragging
                                      ? "shadow-lg ring-2 ring-[var(--accent-gold)]"
                                      : "cursor-grab active:cursor-grabbing"
                                  } ${
                                    conflictedGroupIds.has(g.id) ? "ring-2 ring-amber-500/70" : ""
                                  }`}
                                >
                                  <div className="flex -space-x-1">
                                    {g.posts.slice(0, 2).map((p) => {
                                      const cfg = PLATFORMS[p.platform as keyof typeof PLATFORMS];
                                      const Icon = cfg?.icon;
                                      return Icon ? (
                                        <Icon
                                          key={p.id}
                                          className="h-2.5 w-2.5"
                                          style={{ color: cfg.color }}
                                        />
                                      ) : null;
                                    })}
                                  </div>
                                  <span className="truncate">
                                    {formatTimeId(g.scheduledAt!)} {g.content || "Konten"}
                                  </span>
                                </div>
                              )}
                            </Draggable>
                          ),
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </DragDropContext>
  );
}
