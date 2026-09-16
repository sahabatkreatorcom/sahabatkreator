import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization, twoFactor } from "better-auth/plugins";
// Config khusus untuk CLI generate schema — TANPA import db (agar bisa dijalankan tanpa DB)
export default betterAuth({
    appName: "Sahabat Kreator",
    database: drizzleAdapter({}, {
        provider: "pg",
        schema: {
        // sengaja kosong — CLI hanya membaca plugins/options untuk infer schema
        },
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        minPasswordLength: 8,
        autoSignIn: true,
    },
    user: {
        deleteUser: { enabled: true },
        changeEmail: { enabled: true },
    },
    plugins: [
        organization(),
        twoFactor({
            otpOptions: { digits: 8 },
        }),
        admin({
            defaultRole: "user",
            adminRoles: ["admin"],
            impersonationSessionDuration: 60 * 60,
        }),
    ],
});
