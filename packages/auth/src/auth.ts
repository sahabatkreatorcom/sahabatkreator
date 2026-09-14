import { db } from "@sahabatkreator/db";
import * as authSchema from "@sahabatkreator/db/schema/auth";
import { user as userTable } from "@sahabatkreator/db/schema/auth";
import * as organizationSchema from "@sahabatkreator/db/schema/organization";
import { env } from "@sahabatkreator/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { count } from "drizzle-orm";
import {
  sendChangeEmailConfirmation,
  sendDeleteAccountEmail,
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendTwoFactorOtpEmail,
  sendVerificationEmail,
} from "./email-templates";

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
          // User pertama otomatis menjadi admin platform (superadmin)
          const [row] = await db.select({ total: count() }).from(userTable);
          if ((row?.total ?? 0) === 0 && user.role !== "admin") {
            return { data: { ...user, role: "admin" } };
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
