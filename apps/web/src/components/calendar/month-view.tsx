// Tampilan bulanan kalender — grid 6 minggu + drag-drop reschedule antar tanggal
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { StickyNote } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { ExternalPostChip } from "./external-post-chip";
import {
  type CalendarNote,
  type CalendarPostGroup,
  DAYS_ID,
  toLocalISODate,
  withDragIndexes,
} from "./shared";

type MonthViewProps = {
  cursor: Date;
  postsByDate: Map<string, CalendarPostGroup[]>;
  notesByDate: Map<string, CalendarNote[]>;
  todayKey: string;
  /** Id post group yang terlibat konflik jadwal (ring amber) */
  conflictedGroupIds: Set<string>;
  onAddNote: (dateKey: string) => void;
  onEditNote: (note: CalendarNote) => void;
  onReschedule: (groupId: string, dateKey: string) => void;
};

export function MonthView({
  cursor,
  postsByDate,
  notesByDate,
  todayKey,
  conflictedGroupIds,
  onAddNote,
  onEditNote,
  onReschedule,
}: MonthViewProps) {
  // Grid 6 minggu mulai Senin
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - ((monthStart.getDay() + 6) % 7));

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getTime() + i * 86400000));
  }

  function handleDrop(result: DropResult) {
    if (!result.destination) return;
    const dateKey = result.destination.droppableId.replace("slot:", "");
    const groupId = result.draggableId.replace("post:", "");
    if (!dateKey || !groupId) return;
    onReschedule(groupId, dateKey);
  }

  return (
    <DragDropContext onDragEnd={handleDrop}>
      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-7 border-[var(--border-light)] border-b bg-[var(--bg-secondary)]">
          {DAYS_ID.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center font-medium text-[var(--text-muted)] text-xs"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = toLocalISODate(day);
            const inMonth = day.getMonth() === cursor.getMonth();
            const isToday = key === todayKey;
            const dayPosts = postsByDate.get(key) ?? [];
            const dayNotes = notesByDate.get(key) ?? [];

            return (
              <Droppable key={key} droppableId={`slot:${key}`}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`group min-h-28 border-[var(--border-light)] border-r border-b p-1.5 last:border-r-0 ${
                      inMonth ? "" : "bg-[var(--bg-secondary)]/50 opacity-60"
                    } ${snapshot.isDraggingOver ? "bg-[var(--accent-gold-light)]/40" : ""}`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full font-medium text-xs ${
                          isToday ? "bg-gradient text-white" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      <button
                        type="button"
                        onClick={() => onAddNote(key)}
                        className="hidden rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] group-hover:block"
                        aria-label="Tambah catatan"
                      >
                        <StickyNote className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      {withDragIndexes(dayPosts.slice(0, 3)).map(({ g, dragIndex }) =>
                        dragIndex === null ? (
                          <ExternalPostChip key={g.id} group={g} />
                        ) : (
                          <Draggable key={g.id} draggableId={`post:${g.id}`} index={dragIndex}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                title={g.content || "(tanpa caption)"}
                                className={`flex items-center gap-1 rounded bg-[var(--accent-gold-light)] px-1.5 py-1 text-[var(--text-primary)] text-xs ${
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
                      {dayPosts.length > 3 && (
                        <p className="px-1 text-[10px] text-[var(--text-muted)]">
                          +{dayPosts.length - 3} lagi
                        </p>
                      )}
                      {dayNotes.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => onEditNote(n)}
                          className="block w-full truncate rounded border-l-2 bg-[var(--bg-tertiary)] px-1.5 py-1 text-left text-[var(--text-secondary)] text-xs hover:bg-[var(--bg-primary)]"
                          style={{ borderLeftColor: n.color ?? "var(--accent-pink)" }}
                          title={n.title}
                        >
                          {n.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </div>
    </DragDropContext>
  );
}
