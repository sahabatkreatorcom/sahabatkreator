import {
  db,
  dismissNotificationsByLink,
  getPoolLimits,
  getPoolUsage,
  notifyUser,
  resolvePoolOrgIds,
} from "@sahabatkreator/db";
import { platformSettings } from "@sahabatkreator/db/schema";
import * as authSchema from "@sahabatkreator/db/schema/auth";
import { user as userTable } from "@sahabatkreator/db/schema/auth";
import * as organizationSchema from "@sahabatkreator/db/schema/organization";
import { env } from "@sahabatkreator/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { count, eq } from "drizzle-orm";
import {
  sendChangeEmailConfirmation,
  sendDeleteAccountEmail,
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendTwoFactorOtpEmail,
  sendVerificationEmail,
} from "./email-templates";

/**
 * Gate kredit team_members (pool per-user) — dipanggil saat buat undangan &
 * saat undangan diterima. Limit = anggota DISTINCT lintas seluruh org milik
 * pemilik org ini. Throw 403 agar pesan jelas ke client better-auth.
 */
async function assertTeamMemberQuota(organizationId: string): Promise<void> {
  const orgIds = await resolvePoolOrgIds(organizationId);
  const limits = await getPoolLimits(orgIds);
  const used = await getPoolUsage(orgIds, "team_members");
  if (used >= limits.maxTeamMembers) {
    throw new APIError("FORBIDDEN", {
      code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
      message: `Limit anggota tim tercapai (${limits.maxTeamMembers} untuk plan ${limits.tier}). Upgrade untuk menambah anggota.`,
    });
  }
}

/**
 * Tautan undangan tim — dipakai notifikasi in-app DAN halaman penerimaan
 * (`/team/invite/:id`). Satu sumber supaya keduanya tidak pernah beda rute.
 */
function teamInviteLink(invitationId: string): string {
  return `/team/invite/${invitationId}`;
}

export const auth = betterAuth({
  appName: "Sahabat Kreator",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...authSchema,
      ...organizationSchema,
    },
  }),
  trustedOrigins: [env.CORS_ORIGIN, env.WEB_URL],
  baseURL: env.BETTER_AUTH_URL,
  // Rate limit bawaan better-auth (di 1.6.22 berupa opsi root, bukan plugin).
  // Window 60s × max 20 request per IP — melindungi brute-force login/signup
  // dan endpoint email (spam verifikasi/reset). Default only-production tidak
  // diandalkan; enabled: true memaksa aktif juga di staging.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },
  emailAndPassword: {
    enabled: true,
    // Verifikasi email WAJIB sebelum bisa login (sign-in tanpa verifikasi
    // ditolak dengan error EMAIL_NOT_VERIFIED). Saat signUp, better-auth
    // TIDAK membuat session (return token:null) — email verifikasi dikirim
    // otomatis (sendOnSignUp). Frontend register.tsx menangani respons ini.
    requireEmailVerification: true,
    minPasswordLength: 8,
    autoSignIn: true, // hanya berlaku bila verifikasi tidak diwajibkan
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Percobaan login dengan email belum terverifikasi → kirim ulang email
    // verifikasi otomatis (best practice better-auth agar user tidak terkunci)
    sendOnSignIn: true,
    // Setelah klik link verifikasi, session dibuat otomatis + redirect ke
    // callbackURL (absolut ke WEB_URL) — user langsung masuk tanpa login lagi.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async ({ user, url }) => {
        await sendDeleteAccountEmail(user.email, url);
      },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, url, newEmail }) => {
        await sendChangeEmailConfirmation(user.email, url, newEmail);
      },
    },
    // Org terakhir yang dipakai user — persisten lintas session (session row
    // dihapus saat signOut, jadi session.activeOrganizationId TIDAK bisa
    // diandalkan untuk "ingat org" setelah login baru). Diisi server-side oleh
    // getAuthContext; input:false agar tidak bisa ditulis client langsung.
    additionalFields: {
      lastActiveOrganizationId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 hari
    updateAge: 60 * 60 * 24, // refresh tiap 24 jam
    freshAge: 60 * 5, // 5 menit untuk aksi sensitif (mis. 2FA setup)
  },
  advanced: {
    // Produksi (HTTPS): SameSite=None + Secure — aman untuk web & API
    // di domain/origin berbeda.
    // Dev (HTTP localhost): SameSite=Lax tanpa Secure — browser MENOLAK
    // cookie SameSite=None tanpa Secure; localhost:5173 → :3000 same-site
    // sehingga Lax tetap terkirim pada fetch/XHR.
    useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
    defaultCookieAttributes: {
      sameSite: env.BETTER_AUTH_URL.startsWith("https://") ? "none" : "lax",
      httpOnly: true,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const [row] = await db.select({ total: count() }).from(userTable);
          const isFirstUser = (row?.total ?? 0) === 0;

          // User pertama otomatis menjadi admin platform (superadmin)
          if (isFirstUser && user.role !== "admin") {
            return { data: { ...user, role: "admin" } };
          }

          // Gate "Registrasi Terbuka" (/admin/settings) — tolak signUp saat
          // ditutup. User pertama tetap diizinkan agar bootstrap tidak macet.
          if (!isFirstUser) {
            const [settings] = await db
              .select({ registrationEnabled: platformSettings.registrationEnabled })
              .from(platformSettings)
              .where(eq(platformSettings.id, "singleton"));
            if (settings && !settings.registrationEnabled) {
              throw new APIError("FORBIDDEN", {
                code: "REGISTRATION_DISABLED",
                message: "Registrasi sedang ditutup. Silakan coba lagi nanti.",
              });
            }
          }

          return { data: user };
        },
      },
    },
  },
  plugins: [
    organization({
      sendInvitationEmail: async ({ id, email, role, inviter, organization }) => {
        await sendOrganizationInvitationEmail(email, {
          id,
          role,
          inviterName: inviter.user.name,
          organizationName: organization.name,
        });
      },
      organizationHooks: {
        // Limit anggota tim pool per-user: tolak undangan & accept bila penuh.
        beforeCreateInvitation: async ({ invitation, organization: org }) => {
          await assertTeamMemberQuota(invitation.organizationId ?? org.id);
        },
        // Notifikasi in-app untuk yang diundang (bell di dashboard), di samping
        // email yang sudah dikirim sendInvitationEmail.
        //
        // organizationId SENGAJA null: penerima belum jadi anggota org pengundang,
        // jadi notifikasi bertanda org itu tidak akan pernah lolos filter
        // "org aktif" di GET /notifications. Notifikasi personal (null) tampil
        // di org mana pun user berada.
        //
        // Hanya dikirim bila penerima SUDAH punya akun. Bila belum, email
        // undangan tetap berlaku — dia bisa mendaftar lewat tautan di email.
        afterCreateInvitation: async ({ invitation, inviter, organization: org }) => {
          const [invitee] = await db
            .select({ id: userTable.id })
            .from(userTable)
            .where(eq(userTable.email, invitation.email))
            .limit(1);
          if (!invitee) return;

          await notifyUser({
            organizationId: null,
            userId: invitee.id,
            type: "team",
            title: `Undangan bergabung ke ${org.name}`,
            body: `${inviter.name} mengundang Anda sebagai ${invitation.role}. Buka untuk menerima.`,
            linkUrl: teamInviteLink(invitation.id),
          });
        },
        beforeAcceptInvitation: async ({ invitation }) => {
          await assertTeamMemberQuota(invitation.organizationId);
        },
        // Undangan selesai → tutup notifikasinya supaya tidak menyisakan
        // ajakan basi (tautannya sudah tidak bisa dipakai lagi).
        afterAcceptInvitation: async ({ invitation, user }) => {
          await dismissNotificationsByLink({
            userId: user.id,
            linkUrl: teamInviteLink(invitation.id),
          });
        },
        afterRejectInvitation: async ({ invitation, user }) => {
          await dismissNotificationsByLink({
            userId: user.id,
            linkUrl: teamInviteLink(invitation.id),
          });
        },
        // Dibatalkan pengundang → penerima tidak perlu lagi melihat ajakannya.
        afterCancelInvitation: async ({ invitation }) => {
          const [invitee] = await db
            .select({ id: userTable.id })
            .from(userTable)
            .where(eq(userTable.email, invitation.email))
            .limit(1);
          if (!invitee) return;
          await dismissNotificationsByLink({
            userId: invitee.id,
            linkUrl: teamInviteLink(invitation.id),
          });
        },
      },
    }),
    twoFactor({
      otpOptions: {
        digits: 8,
        sendOTP: async ({ user, otp }) => {
          await sendTwoFactorOtpEmail(user.email, otp);
        },
      },
    }),
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      impersonationSessionDuration: 60 * 60, // 1 jam
    }),
  ],
});
