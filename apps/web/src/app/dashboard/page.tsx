import { StatCard } from "@/components/dashboard/stat-card";

const queue = [
    { platform: "Instagram", title: "Peluncuran koleksi musim gugur", time: "Hari ini, 15:00", status: "scheduled" },
    { platform: "TikTok", title: "Behind the scenes shoot", time: "Hari ini, 18:30", status: "scheduled" },
    { platform: "YouTube", title: "Tutorial styling 5 menit", time: "Kemarin, 09:00", status: "published" },
];

const statusStyle: Record<string, string> = {
    scheduled: "bg-accent-amber/15 text-accent-amber",
    published: "bg-accent-green/15 text-accent-green",
};

const statusLabel: Record<string, string> = {
    scheduled: "Terjadwal",
    published: "Terbit",
};

export default function DashboardPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-lg font-semibold">Ringkasan</h1>
                <p className="text-sm text-muted-foreground">Aktivitas workspace 7 hari terakhir.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Post terjadwal" value="18" delta="+4 minggu ini" trend="up" />
                <StatCard label="Engagement rate" value="4.8%" delta="+0.6%" trend="up" />
                <StatCard label="Followers baru" value="1.204" delta="+12%" trend="up" />
                <StatCard label="Komentar belum dibalas" value="7" delta="-3" trend="down" />
            </div>

            <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="text-sm font-semibold">Antrean konten</h2>
                    <a href="/dashboard/calendar" className="text-xs font-medium text-primary hover:underline">
                        Lihat kalender
                    </a>
                </div>
                <ul className="divide-y divide-border">
                    {queue.map((item) => (
                        <li key={item.title} className="flex items-center gap-3 p-4">
                            <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{item.platform}</span>
                            <span className="flex-1 truncate text-sm">{item.title}</span>
                            <span className="font-mono text-xs text-muted-foreground">{item.time}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[item.status]}`}>
                                {statusLabel[item.status]}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}