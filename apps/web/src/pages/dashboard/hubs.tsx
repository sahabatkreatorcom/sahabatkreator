// Hub Intelijen — 3 halaman bertab yang menggabungkan 9 halaman lama:
// - Performa (/performance): Analitik, Laporan, Goal
// - Riset (/research): Listening, Kompetitor, Tren
// - AI Asisten (/assistant): Coach, SEB, Strategi
// Anak dirender via <Outlet /> (nested route) sehingga code-splitting per
// halaman tetap terjaga. URL lama dialihkan di router.tsx.
import { NavLink, Outlet } from "react-router";

type HubTab = { to: string; label: string };

function HubTabs({ tabs }: { tabs: HubTab[] }) {
  return (
    <div
      className="mb-6 inline-flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-1"
      role="tablist"
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          role="tab"
          className={({ isActive }) =>
            `rounded-[var(--radius-sm)] px-3 py-1.5 font-medium text-xs transition-colors ${
              isActive
                ? "bg-gradient text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

export function PerformancePage() {
  return (
    <div>
      <HubTabs
        tabs={[
          { to: "/performance/analitik", label: "Analitik" },
          { to: "/performance/laporan", label: "Laporan" },
          { to: "/performance/goal", label: "Goal" },
        ]}
      />
      <Outlet />
    </div>
  );
}

export function ResearchPage() {
  return (
    <div>
      <HubTabs
        tabs={[
          { to: "/research/listening", label: "Listening" },
          { to: "/research/kompetitor", label: "Kompetitor" },
          { to: "/research/tren", label: "Tren" },
          { to: "/research/threads", label: "Threads" },
        ]}
      />
      <Outlet />
    </div>
  );
}

export function AssistantPage() {
  return (
    <div>
      <HubTabs
        tabs={[
          { to: "/assistant/coach", label: "Coach" },
          { to: "/assistant/seb", label: "SEB" },
          { to: "/assistant/strategi", label: "Strategi" },
        ]}
      />
      <Outlet />
    </div>
  );
}
