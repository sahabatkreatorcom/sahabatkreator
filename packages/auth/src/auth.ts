import { db } from "@sahabat-kreator/db";
import * as schema from "@sahabat-kreator/db/schema/auth";
import { env } from "@sahabat-kreator/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { sendEmail, emailTemplates } from "@sahabat-kreator/email";

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
      const { subject, html } = emailTemplates.resetPassword({
        name: user.name,
        url,
      });
      await sendEmail({ to: user.email, subject, html });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      const { subject, html } = emailTemplates.verifyEmail({
        name: user.name,
        url,
      });
      await sendEmail({ to: user.email, subject, html });
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            const userName = user.name || "Workspace";
            const slug = `${userName
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9\s-]/g, "")
              .replace(/\s+/g, "-")
              .replace(/-+/g, "-")}-${Date.now().toString(36)}`;

            await auth.api.createOrganization({
              body: {
                name: `${userName}'s Workspace`,
                slug,
                userId: user.id,
              },
            });
          } catch (err) {
            console.error("Failed to auto-create organization:", err);
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          try {
            const memberRow = await db.query.member.findFirst({
              where: (t, { eq }) => eq(t.userId, session.userId),
              columns: { organizationId: true },
            });

            if (memberRow) {
              return {
                data: {
                  ...session,
                  activeOrganizationId: memberRow.organizationId,
                },
              };
            }
          } catch (err) {
            console.error("Failed to set active organization:", err);
          }
          return { data: session };
        },
      },
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
        const { subject, html } = emailTemplates.invitation({
          inviterName: data.inviter.user.name,
          organizationName: data.organization.name,
          role: data.role,
          url: inviteLink,
        });
        await sendEmail({ to: data.email, subject, html });
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
          const { subject, html } = emailTemplates.otp({
            name: user.name,
            otp,
          });
          await sendEmail({ to: user.email, subject, html });
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
