import { env } from "@sahabatkreator/env/server";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Kirim email via Resend. Jika RESEND_API_KEY belum diset (dev),
 * fallback ke console log agar alur auth tetap bisa dites.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput) {
  if (!env.RESEND_API_KEY) {
    console.info(`[email:dev] to=${to} subject=${subject}\n${html}`);
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("[email] resend error", error);
    throw new Error(`Gagal mengirim email: ${error.message}`);
  }
}
