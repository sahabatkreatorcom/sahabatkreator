import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { ServiceWorkerRegistration, PWABanner } from "@/components/pwa";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/login");

    const organizations = await auth.api.listOrganizations({ headers: await headers() });
    const activeOrganizationId = session.session.activeOrganizationId ?? organizations[0]?.id;

    // Belum punya workspace sama sekali -> arahkan buat dulu.
    // Sengaja di luar folder /dashboard supaya tidak ikut dibungkus layout
    // ini lagi (yang butuh activeOrganizationId) dan menyebabkan redirect loop.
    if (!activeOrganizationId) redirect("/onboarding/new-workspace");

    const isPlatformAdmin = session.user.role === "admin";

    return (
        <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
            {/* Sidebar: hanya tampil di layar lg ke atas. Di mobile, navigasi
          yang sama diambil dari nav-config.tsx dan dirender ulang oleh
          BottomNav — jadi tidak ada dua sumber daftar menu. */}
            <aside className="hidden flex-col border-r border-border lg:flex">
                <div className="p-3">
                    <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
                </div>
                <div className="flex-1 overflow-y-auto">
                    <Sidebar isPlatformAdmin={isPlatformAdmin} />
                </div>
            </aside>

            <div className="flex flex-col">
                <Topbar user={{ name: session.user.name, email: session.user.email }} />

                {/* Org switcher tetap terlihat di mobile karena aside disembunyikan */}
                <div className="border-b border-border p-3 lg:hidden">
                    <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
                </div>

                <main className="flex-1 overflow-y-auto p-4 pb-20 lg:p-6 lg:pb-6">{children}</main>
            </div>

            <BottomNav isPlatformAdmin={isPlatformAdmin} />
            <ServiceWorkerRegistration />
            <PWABanner />
        </div>
    );
}
