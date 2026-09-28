// Tampilan bulanan kalender — grid 6 minggu + drag-drop reschedule antar tanggal.
// Sel default menampilkan maksimal 3 post + catatan; klik "+N lainnya" untuk
// memperluas sel (biar grid tetap ringkas).
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { ChevronDown, ChevronUp, Sparkles, StickyNote } from "lucide-react";
import { useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { ExternalPostChip } from "./external-post-chip";
import {
  type CalendarHoliday,
  type CalendarNote,
  type CalendarPostGroup,
  DAYS_ID,
  holidaysForDate,
  MONTHS_ID,
  toLocalISODate,
  withDragIndexes,
} from "./shared";

/** Jumlah post per sel saat collapsed */
const MAX_COLLAPSED = 3;

type MonthViewProps = {
  cursor: Date;
  postsByDate: Map<string, CalendarPostGroup[]>;
  notesByDate: Map<string, CalendarNote[]>;
  todayKey: string;
  /** Id post group yang terlibat konflik jadwal (ring amber) */
  conflictedGroupIds: Set<string>;
  /** Hari besar per tanggal (kunci MM-DD recurring) */
  holidaysByDate: Map<string, CalendarHoliday[]>;
  onAddNote: (dateKey: string) => void;
  onEditNote: (note: CalendarNote) => void;
  onReschedule: (groupId: string, dateKey: string) => void;
  /** Klik kartu post → buka modal detail */
  onSelectPost: (groupId: string) => void;
  /** Klik chip hari besar → buka modal detail */
  onSelectHoliday: (holiday: CalendarHoliday) => void;
};

export function MonthView({
  cursor,
  postsByDate,
  notesByDate,
  todayKey,
  conflictedGroupIds,
  holidaysByDate,
  onAddNote,
  onEditNote,
  onReschedule,
  onSelectPost,
  onSelectHoliday,
}: MonthViewProps) {
  // Tanggal sel yang sedang diperluas (tampilkan semua post)
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
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
            const dayHolidays = holidaysForDate(holidaysByDate, key);
            const isExpanded = expandedDate === key;
            // Collapsed: maksimal 3 post — sisanya via tombol expand
            const visiblePosts = isExpanded ? dayPosts : dayPosts.slice(0, MAX_COLLAPSED);
            const hiddenCount = dayPosts.length - visiblePosts.length;
            const hiddenHolidays = isExpanded ? 0 : Math.max(0, dayHolidays.length - 2);

            return (
              <Droppable key={key} droppableId={`slot:${key}`}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`group relative min-h-28 border-[var(--border-light)] border-r border-b p-1.5 last:border-r-0 ${
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
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
                        aria-label="Tambah catatan"
                        title="Tambah catatan"
                      >
                        <StickyNote className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      {/* Chip hari besar — klik untuk detail ide konten */}
                      {(isExpanded ? dayHolidays : dayHolidays.slice(0, 2)).map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => onSelectHoliday(h)}
                          className="flex w-full items-center gap-1 truncate rounded border-[var(--accent-pink)] border-l-2 bg-[var(--accent-pink-light)]/60 px-1.5 py-1 text-left font-medium text-[10px] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-light)]"
                          title={`${h.name} — lihat ide konten`}
                        >
                          <Sparkles className="h-3 w-3 shrink-0 text-[var(--accent-pink)]" />
                          <span className="truncate">{h.name}</span>
                        </button>
                      ))}
                      {dayHolidays.length > 0 && (
                        <div className="mb-1 border-[var(--border-light)] border-b" />
                      )}
                      {withDragIndexes(visiblePosts).map(({ g, dragIndex }) =>
                        dragIndex === null ? (
                          <ExternalPostChip key={g.id} group={g} onSelect={onSelectPost} />
                        ) : (
                          <Draggable key={g.id} draggableId={`post:${g.id}`} index={dragIndex}>
                            {(dragProvided, dragSnapshot) => (
                              // biome-ignore lint/a11y/useSemanticElements: drag handle dnd — <button> diblokir lib drag
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelectPost(g.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") onSelectPost(g.id);
                                }}
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
                      {dayNotes.slice(0, 2).map((n) => (
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
                      {!isExpanded && dayNotes.length > 2 && (
                        <p className="px-1 text-[10px] text-[var(--text-muted)]">
                          +{dayNotes.length - 2} catatan
                        </p>
                      )}
                      {(hiddenCount > 0 ||
                        (!isExpanded && dayNotes.length > 2) ||
                        hiddenHolidays > 0) && (
                        <button
                          type="button"
                          onClick={() => setExpandedDate(key)}
                          className="flex w-full items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
                        >
                          <ChevronDown className="h-3 w-3" />+
                          {hiddenCount > 0 ? `${hiddenCount} post` : ""}
                          {hiddenCount > 0 && (dayNotes.length > 2 || hiddenHolidays > 0)
                            ? " · "
                            : ""}
                          {hiddenHolidays > 0 ? `${hiddenHolidays} hari besar` : ""}
                          {hiddenHolidays > 0 && dayNotes.length > 2 ? " · " : ""}
                          {dayNotes.length > 2 ? `${dayNotes.length - 2} catatan` : ""} lagi
                        </button>
                      )}
                    </div>

                    {/* Panel expanded — overlay mengambang di atas grid (sel tidak
                        memanjang); tutup via tombol */}
                    {isExpanded && (
                      <div className="absolute inset-x-0 top-0 z-20 max-h-64 space-y-1 overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-primary)] p-1.5 shadow-xl">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-medium text-[var(--text-secondary)] text-xs">
                            {day.getDate()} {MONTHS_ID[day.getMonth()]} — {dayPosts.length} post
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedDate(null)}
                            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
                            aria-label="Tutup"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                        </div>
                        {dayHolidays.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => onSelectHoliday(h)}
                            className="flex w-full items-center gap-1 truncate rounded border-[var(--accent-pink)] border-l-2 bg-[var(--accent-pink-light)]/60 px-1.5 py-1 text-left font-medium text-[10px] text-[var(--text-secondary)] hover:bg-[var(--accent-pink-light)]"
                            title={`${h.name} — lihat ide konten`}
                          >
                            <Sparkles className="h-3 w-3 shrink-0 text-[var(--accent-pink)]" />
                            <span className="truncate">{h.name}</span>
                          </button>
                        ))}
                        {withDragIndexes(dayPosts).map(({ g, dragIndex }) =>
                          dragIndex === null ? (
                            <ExternalPostChip key={g.id} group={g} onSelect={onSelectPost} />
                          ) : (
                            <Draggable key={g.id} draggableId={`post:${g.id}`} index={dragIndex}>
                              {(dragProvided, dragSnapshot) => (
                                // biome-ignore lint/a11y/useSemanticElements: drag handle dnd — <button> diblokir lib drag
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => onSelectPost(g.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") onSelectPost(g.id);
                                  }}
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
                    )}
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
