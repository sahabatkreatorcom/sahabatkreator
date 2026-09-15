import { lazy, type ReactNode, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
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
const CalendarPage = lazy(() =>
  import("./pages/dashboard/calendar").then((m) => ({ default: m.CalendarPage })),
);
const GridPlannerPage = lazy(() =>
  import("./pages/dashboard/grid-planner").then((m) => ({ default: m.GridPlannerPage })),
);
const QueuePage = lazy(() =>
  import("./pages/dashboard/queue").then((m) => ({ default: m.QueuePage })),
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
const MediaPage = lazy(() =>
  import("./pages/dashboard/media").then((m) => ({ default: m.MediaPage })),
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

export const router = createBrowserRouter([
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
      { path: "/grid", element: withFallback(<GridPlannerPage />) },
      { path: "/queue", element: withFallback(<QueuePage />) },
      { path: "/goals", element: withFallback(<GoalsPage />) },
      { path: "/reports", element: withFallback(<ReportsPage />) },
      { path: "/compose", element: withFallback(<ComposePage />) },
      { path: "/media", element: withFallback(<MediaPage />) },
      { path: "/analytics", element: withFallback(<AnalyticsPage />) },
      { path: "/coach", element: withFallback(<CoachPage />) },
      { path: "/seb", element: withFallback(<SebPage />) },
      { path: "/strategy", element: withFallback(<StrategyPage />) },
      { path: "/trends", element: withFallback(<TrendsPage />) },
      { path: "/engagement", element: withFallback(<EngagementPage />) },
      { path: "/inbox", element: withFallback(<InboxPage />) },
      { path: "/automation", element: withFallback(<AutomationPage />) },
      { path: "/products", element: withFallback(<ProductsPage />) },
      { path: "/listening", element: withFallback(<ListeningPage />) },
      { path: "/competitors", element: withFallback(<CompetitorsPage />) },
      { path: "/accounts", element: withFallback(<AccountsPage />) },
      { path: "/status", element: withFallback(<StatusPage />) },
      { path: "/onboarding", element: withFallback(<OnboardingPage />) },
      { path: "/team", element: withFallback(<TeamPage />) },
      { path: "/settings", element: withFallback(<SettingsPage />) },
      { path: "/settings/billing", element: withFallback(<BillingPage />) },
      { path: "/create-organization", element: withFallback(<CreateOrgPage />) },
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
      { path: "/admin/plans", element: withFallback(<AdminPlansPage />) },
      { path: "/admin/billing", element: withFallback(<AdminBillingPage />) },
      { path: "/admin/payment-config", element: withFallback(<AdminPaymentConfigPage />) },
      { path: "/admin/credentials", element: withFallback(<AdminCredentialsPage />) },
      { path: "/admin/api-access", element: withFallback(<AdminApiAccessPage />) },
      { path: "/admin/api-tests", element: withFallback(<AdminApiTestsPage />) },
      { path: "/admin/api-quota", element: withFallback(<AdminApiQuotaPage />) },
      { path: "/admin/contact", element: withFallback(<AdminContactPage />) },
      { path: "/admin/settings", element: withFallback(<AdminSettingsPage />) },
      { path: "/admin/logs", element: withFallback(<AdminLogsPage />) },
      { path: "/admin/org-activity", element: withFallback(<AdminOrgActivityPage />) },
    ],
  },

  // 404 — semua path tak dikenal (sebelumnya Navigate ke / = soft-404 buruk
  // untuk SEO; halaman nyata + noindex lebih benar)
  { path: "*", element: <NotFoundPage /> },
]);
