"use client";

import { useState } from "react";
import { X, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScheduleModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (date: string, time: string) => void;
    loading?: boolean;
}

export function ScheduleModal({ open, onClose, onConfirm, loading }: ScheduleModalProps) {
    const today = new Date().toISOString().split("T")[0];
    const [date, setDate] = useState(today);
    const [time, setTime] = useState("09:00");

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-xl bg-background p-6 shadow-2xl mx-4">
                <button onClick={onClose} className="absolute right-3 top-3 rounded-md bg-muted p-1 hover:bg-muted/80">
                    <X className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2 mb-4">
                    <CalendarClock className="h-5 w-5 text-primary" />
                    <h2 className="text-base font-semibold">Jadwalkan Post</h2>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
                        <input
                            type="date"
                            value={date}
                            min={today}
                            onChange={(e) => setDate(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Waktu</label>
                        <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                </div>

                <div className="flex gap-3 mt-6">
                    <Button variant="secondary" onClick={onClose} className="flex-1">Batal</Button>
                    <Button onClick={() => onConfirm(date, time)} loading={loading} className="flex-1">
                        Jadwalkan
                    </Button>
                </div>
            </div>
        </div>
    );
}
