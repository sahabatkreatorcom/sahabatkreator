import { lazy, type ReactNode, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "./components/layout/floating-chat";
// Admin
import { AdminLayout } from "./layouts/admin-layout";
import { AuthLayout } from "./layouts/auth-layout";
// Dashboard
import { DashboardLayout } from "./layouts/dashboard-layout";
import { MarketingLayout } from "./layouts/marketing-layout";
import { RequireAdmin } from "./layouts/require-admin";
import { RedirectIfAuthenticated, RequireAuth } from "./layouts/require-auth";
import { ForgotPasswordPage } from "./pages/auth/forgot-password";
// Auth
import { LoginPage } from "./pages/auth/login";
import { RegisterPage } from "./pages/auth/register";
import { ResetPasswordPage } from "./pages/auth/reset-password";
import { TwoFactorPage } from "./pages/auth/two-factor";
import { VerifyEmailPage } from "./pages/auth/verify-email";
import { ChangelogPage } from "./pages/changelog";
import { ComparePage } from "./pages/compare";
// Undangan org (publik)
import { InviteAcceptPage } from "./pages/dashboard/invite-accept";
import { FaqPage } from "./pages/faq";
import { AboutPage } from "./pages/marketing/about";
import { BlogListPage } from "./pages/marketing/blog-list";
import { BlogPostPage } from "./pages/marketing/blog-post";
import { ContactPage } from "./pages/marketing/contact";
import { DeletionStatusPage } from "./pages/marketing/deletion-status";
// Marketing
import { LandingPage } from "./pages/marketing/landing";
import { LegalPage, LegalRedirect } from "./pages/marketing/legal";
import { PricingPage } from "./pages/marketing/pricing";
// 404 nyata dengan noindex (bukan soft-404 redirect ke /)
import { NotFoundPage } from "./pages/not-found";
import { ReplizFragmentPage } from "./pages/oauth/repliz-fragment";
// Landing push notification (auth, fullscreen tanpa sidebar)
import { PostFailedPage } from "./pages/post-failed";
// Laporan publik via link token (publik, read-only)
import { PublicReportPage } from "./pages/public-report";
import { PublishReadyPage } from "./pages/publish-ready";

// ---------- Code-splitting: halaman dashboard & admin di-lazy ----------
// Marketing + auth tetap eager demi first paint / SEO / flow login.
// Layout tetap eager agar guard org/role tetap jalan sebelum chunk halaman termuat.
const withFallback = (node: ReactNode) => <Suspense fallback={<PageSkeleton />}>{node}</Suspense>;

// Fallback ringan — hindari layout shift besar saat chunk halaman dimuat
function PageSkeleton() {
  return (
    <div className="flex h-[calc(100vh-6rem)] w-full items-center justify-center">
      <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--bg-secondary)]" />
    </div>
  );
}

// --- Dashboard ---
const DashboardPage = lazy(() =>
  import("./pages/dashboard/dashboard").then((m) => ({ default: m.DashboardPage })),
);
const ActivityPage = lazy(() =>
  import("./pages/dashboard/activity").then((m) => ({ default: m.default })),
);
// Hub Intelijen — wrapper bertab untuk 9 halaman intelijen (nested route)
const PerformancePage = lazy(() =>
  import("./pages/dashboard/hubs").then((m) => ({ default: m.PerformancePage })),
);
const ResearchPage = lazy(() =>
  import("./pages/dashboard/hubs").then((m) => ({ default: m.ResearchPage })),
);
const AssistantPage = lazy(() =>
  import("./pages/dashboard/hubs").then((m) => ({ default: m.AssistantPage })),
);
const CalendarPage = lazy(() =>
  import("./pages/dashboard/calendar").then((m) => ({ default: m.CalendarPage })),
);
const QueuePage = lazy(() =>
  import("./pages/dashboard/queue").then((m) => ({ default: m.QueuePage })),
);
const PostResultsPage = lazy(() =>
  import("./pages/dashboard/post-results").then((m) => ({ default: m.PostResultsPage })),
);
const GoalsPage = lazy(() =>
  import("./pages/dashboard/goals").then((m) => ({ default: m.GoalsPage })),
);
const ReportsPage = lazy(() =>
  import("./pages/dashboard/reports").then((m) => ({ default: m.ReportsPage })),
);
const ComposePage = lazy(() =>
  import("./pages/dashboard/compose").then((m) => ({ default: m.ComposePage })),
);
const RepurposePage = lazy(() =>
  import("./pages/dashboard/repurpose").then((m) => ({ default: m.RepurposePage })),
);
const CarouselGeneratorPage = lazy(() =>
  import("./pages/dashboard/carousel-generator").then((m) => ({
    default: m.CarouselGeneratorPage,
  })),
);
const MediaPage = lazy(() =>
  import("./pages/dashboard/media").then((m) => ({ default: m.MediaPage })),
);
const VideoRenderPage = lazy(() =>
  import("./pages/dashboard/video").then((m) => ({ default: m.VideoRenderPage })),
);
const AutoClipPage = lazy(() =>
  import("./pages/dashboard/auto-clip").then((m) => ({ default: m.AutoClipPage })),
);
const RendersPage = lazy(() =>
  import("./pages/dashboard/renders").then((m) => ({ default: m.RendersPage })),
);
const SoundPage = lazy(() =>
  import("./pages/dashboard/sound").then((m) => ({ default: m.SoundPage })),
);
const AnalyticsPage = lazy(() =>
  import("./pages/dashboard/analytics").then((m) => ({ default: m.AnalyticsPage })),
);
const CoachPage = lazy(() =>
  import("./pages/dashboard/coach").then((m) => ({ default: m.CoachPage })),
);
const SebPage = lazy(() => import("./pages/dashboard/seb").then((m) => ({ default: m.SebPage })));
const StrategyPage = lazy(() =>
  import("./pages/dashboard/strategy").then((m) => ({ default: m.StrategyPage })),
);
const TrendsPage = lazy(() =>
  import("./pages/dashboard/trends").then((m) => ({ default: m.TrendsPage })),
);
const EngagementPage = lazy(() =>
  import("./pages/dashboard/engagement").then((m) => ({ default: m.EngagementPage })),
);
const InboxPage = lazy(() =>
  import("./pages/dashboard/inbox").then((m) => ({ default: m.default })),
);
const AutomationPage = lazy(() =>
  import("./pages/dashboard/automation").then((m) => ({ default: m.default })),
);
const ProductsPage = lazy(() =>
  import("./pages/dashboard/products").then((m) => ({ default: m.default })),
);
const ListeningPage = lazy(() =>
  import("./pages/dashboard/listening").then((m) => ({ default: m.ListeningPage })),
);
const CompetitorsPage = lazy(() =>
  import("./pages/dashboard/competitors").then((m) => ({ default: m.CompetitorsPage })),
);
const ThreadsResearchPage = lazy(() =>
  import("./pages/dashboard/threads-research").then((m) => ({ default: m.ThreadsResearchPage })),
);
const AccountsPage = lazy(() =>
  import("./pages/dashboard/accounts").then((m) => ({ default: m.AccountsPage })),
);
const StatusPage = lazy(() =>
  import("./pages/dashboard/status").then((m) => ({ default: m.default })),
);
const OnboardingPage = lazy(() =>
  import("./pages/onboarding").then((m) => ({ default: m.OnboardingPage })),
);
const TeamPage = lazy(() =>
  import("./pages/dashboard/team").then((m) => ({ default: m.TeamPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/dashboard/settings").then((m) => ({ default: m.SettingsPage })),
);
const BillingPage = lazy(() =>
  import("./pages/dashboard/billing").then((m) => ({ default: m.BillingPage })),
);
const CreateOrgPage = lazy(() =>
  import("./pages/dashboard/create-org").then((m) => ({ default: m.CreateOrgPage })),
);

// --- Admin ---
const AdminDashboardPage = lazy(() =>
  import("./pages/admin/dashboard").then((m) => ({ default: m.AdminDashboardPage })),
);
const AdminUsersPage = lazy(() =>
  import("./pages/admin/users").then((m) => ({ default: m.AdminUsersPage })),
);
const AdminOrganizationsPage = lazy(() =>
  import("./pages/admin/organizations").then((m) => ({ default: m.AdminOrganizationsPage })),
);
const AdminCollabsPage = lazy(() =>
  import("./pages/admin/collabs").then((m) => ({ default: m.AdminCollabsPage })),
);
const AdminBlogPage = lazy(() =>
  import("./pages/admin/blog").then((m) => ({ default: m.AdminBlogPage })),
);
const AdminBlogEditorPage = lazy(() =>
  import("./pages/admin/blog-editor").then((m) => ({ default: m.AdminBlogEditorPage })),
);
const AdminHolidaysPage = lazy(() =>
  import("./pages/admin/holidays").then((m) => ({ default: m.AdminHolidaysPage })),
);
const AdminPlansPage = lazy(() =>
  import("./pages/admin/plans").then((m) => ({ default: m.AdminPlansPage })),
);
const AdminBillingPage = lazy(() =>
  import("./pages/admin/billing").then((m) => ({ default: m.AdminBillingPage })),
);
const AdminPaymentConfigPage = lazy(() =>
  import("./pages/admin/payment-config").then((m) => ({ default: m.AdminPaymentConfigPage })),
);
const AdminCredentialsPage = lazy(() =>
  import("./pages/admin/credentials").then((m) => ({ default: m.AdminCredentialsPage })),
);
const AdminApiAccessPage = lazy(() =>
  import("./pages/admin/api-access").then((m) => ({ default: m.AdminApiAccessPage })),
);
const AdminApiTestsPage = lazy(() =>
  import("./pages/admin/api-tests").then((m) => ({ default: m.AdminApiTestsPage })),
);
const AdminApiQuotaPage = lazy(() =>
  import("./pages/admin/api-quota").then((m) => ({ default: m.AdminApiQuotaPage })),
);
const AdminAiUsagePage = lazy(() =>
  import("./pages/admin/ai-usage").then((m) => ({ default: m.AdminAiUsagePage })),
);
const AdminContactPage = lazy(() =>
  import("./pages/admin/contact-inbox").then((m) => ({ default: m.AdminContactPage })),
);
const AdminSettingsPage = lazy(() =>
  import("./pages/admin/settings").then((m) => ({ default: m.AdminSettingsPage })),
);
const AdminLogsPage = lazy(() =>
  import("./pages/admin/logs").then((m) => ({ default: m.AdminLogsPage })),
);
const AdminOrgActivityPage = lazy(() =>
  import("./pages/admin/org-activity").then((m) => ({ default: m.AdminOrgActivityPage })),
);
const AdminMonitoringPage = lazy(() =>
  import("./pages/admin/monitoring").then((m) => ({ default: m.AdminMonitoringPage })),
);

export const router = createBrowserRouter([
  // Shell global — floating AI chat tampil di semua halaman
  {
    element: <AppShell />,
    children: [
      // ---------- Marketing (public, SEO) ----------
      {
        element: <MarketingLayout />,
        children: [
          { path: "/", element: <LandingPage /> },
          { path: "/harga", element: <PricingPage /> },
          { path: "/blog", element: <BlogListPage /> },
          { path: "/blog/:slug", element: <BlogPostPage /> },
          { path: "/tentang", element: <AboutPage /> },
          { path: "/kontak", element: <ContactPage /> },
          { path: "/faq", element: <FaqPage /> },
          { path: "/changelog", element: <ChangelogPage /> },
          { path: "/compare", element: <ComparePage /> },
          // Dokumen legal — URL sederhana per dokumen (SEO friendly)
          { path: "/syarat-ketentuan", element: <LegalPage doc="syarat-ketentuan" /> },
          { path: "/kebijakan-privasi", element: <LegalPage doc="kebijakan-privasi" /> },
          { path: "/kebijakan-cookie", element: <LegalPage doc="kebijakan-cookie" /> },
          { path: "/penghapusan-data", element: <LegalPage doc="penghapusan-data" /> },
          // Status penghapusan data end-user (confirmation URL dari platform callback)
          { path: "/penghapusan-data/status", element: <DeletionStatusPage /> },
          { path: "/kebijakan-refund", element: <LegalPage doc="kebijakan-refund" /> },
          // English privacy policy — for Meta/LinkedIn App Review (international reviewers)
          { path: "/privacy-policy", element: <LegalPage doc="privacy-policy" /> },
          // English terms of service — for Meta/LinkedIn App Review (international reviewers)
          { path: "/terms-of-service", element: <LegalPage doc="terms-of-service" /> },
          // Redirect path lama → path baru. Path statis ditangani server-side
          // 301 permanen (lihat apps/server/src/index.ts LEGACY_REDIRECTS);
          // di sini hanya pola dinamis yang tidak bisa di-handle server.
          { path: "/fitur", element: <Navigate to="/#fitur" replace /> },
          { path: "/rss.xml", element: <Navigate to="/blog" replace /> },
          { path: "/legal/:doc", element: <LegalRedirect /> },
          { path: "/ketentuan/:doc", element: <LegalRedirect /> },
        ],
      },

      // ---------- Auth ----------
      {
        element: <AuthLayout />,
        children: [
          // Halaman guest — redirect ke dashboard bila session masih aktif
          {
            element: <RedirectIfAuthenticated />,
            children: [
              { path: "/login", element: <LoginPage /> },
              { path: "/register", element: <RegisterPage /> },
              { path: "/forgot-password", element: <ForgotPasswordPage /> },
              { path: "/reset-password", element: <ResetPasswordPage /> },
            ],
          },
          // verify-email & two-factor — bagian flow login, session parsial wajar ada
          { path: "/verify-email", element: <VerifyEmailPage /> },
          { path: "/two-factor", element: <TwoFactorPage /> },
        ],
      },

      // ---------- Undangan org (publik) ----------
      { path: "/team/invite/:id", element: <InviteAcceptPage /> },

      // ---------- Laporan publik via share link (publik, read-only) ----------
      { path: "/r/:token", element: <PublicReportPage /> },

      // ---------- Relay fragment OAuth Repliz (fallback) ----------
      // Dalam praktiknya semua platform (termasuk Facebook) mengembalikan ?code=…
      // di query string langsung ke callback server. Halaman ini tetap dipertahankan
      // sebagai fallback bila Repliz kembali mengembalikan token di URL fragment
      // (#access_token=…) — hash tidak pernah sampai server, jadi dibaca di sini.
      { path: "/oauth/repliz-fragment/:platform/:state", element: <ReplizFragmentPage /> },

      // ---------- Landing push notification (auth, fullscreen tanpa sidebar) ----------
      {
        element: <RequireAuth />,
        children: [
          { path: "/post-failed", element: <PostFailedPage /> },
          { path: "/publish-ready", element: <PublishReadyPage /> },
        ],
      },

      // ---------- Dashboard (protected) ----------
      {
        element: (
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        ),
        children: [
          { path: "/dashboard", element: withFallback(<DashboardPage />) },
          { path: "/activity", element: withFallback(<ActivityPage />) },
          { path: "/calendar", element: withFallback(<CalendarPage />) },
          { path: "/queue", element: withFallback(<QueuePage />) },
          { path: "/post-results", element: withFallback(<PostResultsPage />) },
          { path: "/compose", element: withFallback(<ComposePage />) },
          // ---------- Generator AI (mandiri) ----------
          { path: "/generator/repurpose", element: withFallback(<RepurposePage />) },
          { path: "/generator/carousel", element: withFallback(<CarouselGeneratorPage />) },
          { path: "/media", element: withFallback(<MediaPage />) },
          { path: "/video", element: withFallback(<VideoRenderPage />) },
          { path: "/auto-clip", element: withFallback(<AutoClipPage />) },
          { path: "/renders", element: withFallback(<RendersPage />) },
          { path: "/sound", element: withFallback(<SoundPage />) },
          { path: "/engagement", element: withFallback(<EngagementPage />) },
          { path: "/inbox", element: withFallback(<InboxPage />) },
          { path: "/automation", element: withFallback(<AutomationPage />) },
          { path: "/products", element: withFallback(<ProductsPage />) },
          { path: "/accounts", element: withFallback(<AccountsPage />) },
          { path: "/status", element: withFallback(<StatusPage />) },
          { path: "/onboarding", element: withFallback(<OnboardingPage />) },
          { path: "/team", element: withFallback(<TeamPage />) },
          { path: "/settings", element: withFallback(<SettingsPage />) },
          { path: "/settings/billing", element: withFallback(<BillingPage />) },
          { path: "/create-organization", element: withFallback(<CreateOrgPage />) },

          // ---------- Hub Intelijen — 3 halaman bertab ----------
          {
            path: "/performance",
            element: withFallback(<PerformancePage />),
            children: [
              { index: true, element: <Navigate to="/performance/analitik" replace /> },
              { path: "analitik", element: withFallback(<AnalyticsPage />) },
              { path: "laporan", element: withFallback(<ReportsPage />) },
              { path: "goal", element: withFallback(<GoalsPage />) },
            ],
          },
          {
            path: "/research",
            element: withFallback(<ResearchPage />),
            children: [
              { index: true, element: <Navigate to="/research/listening" replace /> },
              { path: "listening", element: withFallback(<ListeningPage />) },
              { path: "kompetitor", element: withFallback(<CompetitorsPage />) },
              { path: "tren", element: withFallback(<TrendsPage />) },
              { path: "threads", element: withFallback(<ThreadsResearchPage />) },
            ],
          },
          {
            path: "/assistant",
            element: withFallback(<AssistantPage />),
            children: [
              { index: true, element: <Navigate to="/assistant/coach" replace /> },
              { path: "coach", element: withFallback(<CoachPage />) },
              { path: "seb", element: withFallback(<SebPage />) },
              { path: "strategi", element: withFallback(<StrategyPage />) },
            ],
          },

          // Redirect URL lama → tab di hub yang sesuai
          { path: "/analytics", element: <Navigate to="/performance/analitik" replace /> },
          { path: "/reports", element: <Navigate to="/performance/laporan" replace /> },
          { path: "/goals", element: <Navigate to="/performance/goal" replace /> },
          { path: "/listening", element: <Navigate to="/research/listening" replace /> },
          { path: "/competitors", element: <Navigate to="/research/kompetitor" replace /> },
          { path: "/trends", element: <Navigate to="/research/tren" replace /> },
          { path: "/coach", element: <Navigate to="/assistant/coach" replace /> },
          { path: "/seb", element: <Navigate to="/assistant/seb" replace /> },
          { path: "/strategy", element: <Navigate to="/assistant/strategi" replace /> },
          { path: "/grid", element: <Navigate to="/calendar" replace /> },
        ],
      },

      // ---------- Admin (superadmin) ----------
      {
        element: (
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        ),
        children: [
          { path: "/admin", element: withFallback(<AdminDashboardPage />) },
          { path: "/admin/users", element: withFallback(<AdminUsersPage />) },
          { path: "/admin/organizations", element: withFallback(<AdminOrganizationsPage />) },
          { path: "/admin/collabs", element: withFallback(<AdminCollabsPage />) },
          { path: "/admin/blog", element: withFallback(<AdminBlogPage />) },
          { path: "/admin/blog/new", element: withFallback(<AdminBlogEditorPage />) },
          { path: "/admin/blog/:id", element: withFallback(<AdminBlogEditorPage />) },
          { path: "/admin/holidays", element: withFallback(<AdminHolidaysPage />) },
          { path: "/admin/plans", element: withFallback(<AdminPlansPage />) },
          { path: "/admin/billing", element: withFallback(<AdminBillingPage />) },
          { path: "/admin/payment-config", element: withFallback(<AdminPaymentConfigPage />) },
          { path: "/admin/credentials", element: withFallback(<AdminCredentialsPage />) },
          { path: "/admin/api-access", element: withFallback(<AdminApiAccessPage />) },
          { path: "/admin/api-tests", element: withFallback(<AdminApiTestsPage />) },
          { path: "/admin/api-quota", element: withFallback(<AdminApiQuotaPage />) },
          { path: "/admin/ai-usage", element: withFallback(<AdminAiUsagePage />) },
          { path: "/admin/contact", element: withFallback(<AdminContactPage />) },
          { path: "/admin/settings", element: withFallback(<AdminSettingsPage />) },
          { path: "/admin/logs", element: withFallback(<AdminLogsPage />) },
          { path: "/admin/org-activity", element: withFallback(<AdminOrgActivityPage />) },
          { path: "/admin/monitoring", element: withFallback(<AdminMonitoringPage />) },
        ],
      },

      // 404 — semua path tak dikenal (sebelumnya Navigate ke / = soft-404 buruk
      // untuk SEO; halaman nyata + noindex lebih benar)
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
