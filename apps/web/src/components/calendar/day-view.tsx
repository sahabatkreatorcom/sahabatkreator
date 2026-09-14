// Tampilan harian kalender — timeline jam untuk satu hari + drag-drop antar jam
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { StickyNote } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { ExternalPostChip } from "./external-post-chip";
import { type CalendarNote, type CalendarPostGroup, formatTimeId, withDragIndexes } from "./shared";

/** 24 slot jam (00–23) */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type DayViewProps = {
  date: Date;
  dateKey: string;
  postsByDate: Map<string, CalendarPostGroup[]>;
  notesByDate: Map<string, CalendarNote[]>;
  /** Id post group yang terlibat konflik jadwal (ring amber) */
  conflictedGroupIds: Set<string>;
  onAddNote: (dateKey: string) => void;
  onEditNote: (note: CalendarNote) => void;
  onReschedule: (groupId: string, dateKey: string, hour: number) => void;
};

export function DayView({
  date,
  dateKey,
  postsByDate,
  notesByDate,
  conflictedGroupIds,
  onAddNote,
  onEditNote,
  onReschedule,
}: DayViewProps) {
  const dayPosts = postsByDate.get(dateKey) ?? [];
  const dayNotes = notesByDate.get(dateKey) ?? [];

  function handleDrop(result: DropResult) {
    if (!result.destination) return;
    const m = result.destination.droppableId.match(/^slot:\d{4}-\d{2}-\d{2}:(\d{2})$/);
    if (!m) return;
    const groupId = result.draggableId.replace("post:", "");
    if (!groupId) return;
    onReschedule(groupId, dateKey, Number(m[1]));
  }

  return (
    <DragDropContext onDragEnd={handleDrop}>
      <div className="space-y-4">
        {/* Catatan hari ini */}
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Catatan hari ini</h3>
            <button
              type="button"
              onClick={() => onAddNote(dateKey)}
              className="flex items-center gap-1 rounded px-2 py-1 text-[var(--text-secondary)] text-xs hover:bg-[var(--bg-tertiary)]"
            >
              <StickyNote className="h-3 w-3" />
              Tambah
            </button>
          </div>
          {dayNotes.length === 0 ? (
            <p className="text-[var(--text-muted)] text-xs">Belum ada catatan.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dayNotes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onEditNote(n)}
                  className="max-w-64 truncate rounded border-l-2 bg-[var(--bg-tertiary)] px-2 py-1 text-[var(--text-secondary)] text-xs hover:bg-[var(--bg-primary)]"
                  style={{ borderLeftColor: n.color ?? "var(--accent-pink)" }}
                  title={n.title}
                >
                  {n.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeline jam */}
        <div className="card overflow-hidden p-0">
          {HOURS.map((hour) => {
            const hourPosts = dayPosts.filter((g) => {
              if (!g.scheduledAt) return false;
              return new Date(g.scheduledAt).getHours() === hour;
            });
            const now = new Date();
            const isNow = now.toDateString() === date.toDateString() && now.getHours() === hour;

            return (
              <div key={hour} className={`flex ${isNow ? "bg-[var(--accent-gold-light)]/10" : ""}`}>
                <div className="w-16 shrink-0 border-[var(--border-light)] border-r px-2 py-2 text-right text-[10px] text-[var(--text-muted)]">
                  {String(hour).padStart(2, "0")}:00
                </div>
                <Droppable droppableId={`slot:${dateKey}:${String(hour).padStart(2, "0")}`}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-12 flex-1 space-y-1 p-1 ${
                        snapshot.isDraggingOver ? "bg-[var(--accent-gold-light)]/40" : ""
                      }`}
                    >
                      {withDragIndexes(hourPosts).map(({ g, dragIndex }) =>
                        dragIndex === null ? (
                          <ExternalPostChip key={g.id} group={g} showTime />
                        ) : (
                          <Draggable key={g.id} draggableId={`post:${g.id}`} index={dragIndex}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                title={g.content || "(tanpa caption)"}
                                className={`flex items-center gap-2 rounded bg-[var(--accent-gold-light)] px-2 py-1.5 text-[var(--text-primary)] text-xs ${
                                  dragSnapshot.isDragging
                                    ? "shadow-lg ring-2 ring-[var(--accent-gold)]"
                                    : "cursor-grab active:cursor-grabbing"
                                } ${
                                  conflictedGroupIds.has(g.id) ? "ring-2 ring-amber-500/70" : ""
                                }`}
                              >
                                <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                                  {formatTimeId(g.scheduledAt!)}
                                </span>
                                <div className="flex -space-x-1">
                                  {g.posts.map((p) => {
                                    const cfg = PLATFORMS[p.platform as keyof typeof PLATFORMS];
                                    const Icon = cfg?.icon;
                                    return Icon ? (
                                      <Icon
                                        key={p.id}
                                        className="h-3 w-3"
                                        style={{ color: cfg.color }}
                                      />
                                    ) : null;
                                  })}
                                </div>
                                <span className="truncate">{g.content || "Konten"}</span>
                              </div>
                            )}
                          </Draggable>
                        ),
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </div>
    </DragDropContext>
  );
}
