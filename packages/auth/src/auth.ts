import { db } from "@sahabat-kreator/db";
import * as schema from "@sahabat-kreator/db/schema/auth";
import { env } from "@sahabat-kreator/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { sendEmail } from "@sahabat-kreator/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export const auth = betterAuth({
  appName: "Sahabat Kreator",
  database: drizzleAdapter(db, {
    provider: "pg",

    schema: schema,
  }),
  trustedOrigins: [env.CORS_ORIGIN],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Reset password Anda",
        html: `<p>Halo ${user.name},</p>
               <p>Klik tautan berikut untuk reset password (berlaku 1 jam):</p>
               <a href="${url}">${url}</a>`,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Verifikasi email Anda",
        html: `<p>Halo ${user.name}, klik untuk verifikasi akun Anda:</p>
               <a href="${url}">${url}</a>`,
      });
    },
  },


  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
      membershipLimit: 100,
      creatorRole: "owner",
      invitationExpiresIn: 60 * 60 * 24 * 7, // 7 hari
      invitationLimit: 50,
      cancelPendingInvitationsOnReInvite: true,

      async sendInvitationEmail(data) {
        const inviteLink = `${APP_URL}/accept-invitation/${data.invitation.id}`;
        await sendEmail({
          to: data.email,
          subject: `Undangan bergabung ke ${data.organization.name}`,
          html: `<p>${data.inviter.user.name} mengundang Anda ke workspace
                 <b>${data.organization.name}</b> sebagai <b>${data.role}</b>.</p>
                 <a href="${inviteLink}">Terima Undangan</a>`,
        });
      },
      // teams: aktifkan kalau butuh sub-grup dalam satu organization
      teams: { enabled: true, maximumTeams: 20 },
    }),

    // === ADMIN (platform-level, bukan role di dalam org) ===
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      impersonationSessionDuration: 60 * 60, // 1 jam
      // opsional: default ban duration kalau tidak dispesifikkan saat banUser
      defaultBanReason: "Melanggar kebijakan penggunaan",
    }),

    // === TWO FACTOR (TOTP + OTP email via Resend) ===
    twoFactor({
      issuer: "Sahabat Kreator",
      otpOptions: {
        period: 5,       // menit masa berlaku
        digits: 6,
        allowedAttempts: 5,
        async sendOTP({ user, otp }) {
          await sendEmail({
            to: user.email,
            subject: "Kode verifikasi 2FA Anda",
            html: `<p>Kode OTP Anda: <b style="font-size:20px">${otp}</b></p>
                   <p>Berlaku 5 menit.</p>`,
          });
        },
      },
      skipVerificationOnEnable: false, // wajib verifikasi TOTP saat pertama enable
    }),
    nextCookies(),
  ],
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
});
