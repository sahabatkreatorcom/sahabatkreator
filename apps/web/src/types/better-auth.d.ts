/**
 * Custom session augmentation.
 *
 * Plugin custom-session di server bisa memodifikasi response `getSession` dan
 * `list-sessions`. Tambahkan field di sini agar `useSession()` dan `auth.api.getSession()`
 * mengetahuinya tanpa harus menompak `Session` bawaan better-auth.
 *
 * Contoh:
 *   // packages/auth/src/auth.ts
 *   customSession(async ({ session }) => ({
 *     ...session,
 *     lastAccessAt: new Date(),
 *   }))
 */
declare module "better-auth/react" {
    interface Session {
        /** Field tambahan dari plugin custom-session (jika ada). */
        [key: string]: unknown;
    }
}

