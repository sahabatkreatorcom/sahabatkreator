import { env } from "@sahabatkreator/env/server";
import { sendEmail } from "./send-email";

const BRAND_NAME = "Sahabat Kreator";
const ACCENT = "#D4A574";
const ACCENT_PINK = "#E8B4B8";

function emailShell(title: string, bodyHtml: string, footerHtml = "") {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#FAFAFA;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E5E5E7;border-radius:16px;padding:32px;">
          <tr><td align="center" style="padding-bottom:24px;">
            <span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;">
              Sahabat <span style="color:${ACCENT};">Kreator</span>
            </span>
          </td></tr>
          <tr><td style="padding-bottom:8px;">
            <h1 style="margin:0;font-size:18px;font-weight:600;">${title}</h1>
          </td></tr>
          <tr><td style="font-size:14px;line-height:1.6;color:#6B6B6B;">
            ${bodyHtml}
          </td></tr>
          ${footerHtml}
          <tr><td style="padding-top:32px;font-size:12px;color:#9A9A9A;text-align:center;">
            © ${new Date().getFullYear()} ${BRAND_NAME}. Email otomatis — mohon tidak dibalas.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function button(url: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td align="center" style="border-radius:9999px;background:linear-gradient(135deg,${ACCENT} 0%,${ACCENT_PINK} 100%);">
    <a href="${url}" style="display:inline-block;padding:12px 28px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">${label}</a>
  </td></tr></table>
  <p style="font-size:12px;color:#9A9A9A;word-break:break-all;">Atau salin tautan berikut ke browser:<br/>${url}</p>`;
}

export async function sendVerificationEmail(to: string, url: string) {
  await sendEmail({
    to,
    subject: `Verifikasi email Anda — ${BRAND_NAME}`,
    html: emailShell(
      "Verifikasi email Anda",
      `<p>Halo! Terima kasih telah mendaftar di ${BRAND_NAME}. Klik tombol di bawah untuk memverifikasi alamat email Anda.</p>
       ${button(url, "Verifikasi Email")}
       <p>Tautan berlaku selama 1 jam.</p>`,
    ),
  });
}

export async function sendPasswordResetEmail(to: string, url: string) {
  await sendEmail({
    to,
    subject: `Reset kata sandi — ${BRAND_NAME}`,
    html: emailShell(
      "Reset kata sandi",
      `<p>Kami menerima permintaan reset kata sandi untuk akun Anda. Klik tombol di bawah untuk mengatur kata sandi baru.</p>
       ${button(url, "Reset Kata Sandi")}
       <p>Jika Anda tidak meminta reset ini, abaikan email ini. Tautan berlaku selama 1 jam.</p>`,
    ),
  });
}

export async function sendChangeEmailConfirmation(to: string, url: string, newEmail: string) {
  await sendEmail({
    to,
    subject: `Konfirmasi perubahan email — ${BRAND_NAME}`,
    html: emailShell(
      "Konfirmasi perubahan email",
      `<p>Anda meminta perubahan email akun menjadi <strong>${newEmail}</strong>. Klik tombol di bawah untuk mengonfirmasi.</p>
       ${button(url, "Konfirmasi Perubahan")}`,
    ),
  });
}

export async function sendDeleteAccountEmail(to: string, url: string) {
  await sendEmail({
    to,
    subject: `Hapus akun — ${BRAND_NAME}`,
    html: emailShell(
      "Konfirmasi penghapusan akun",
      `<p>Anda meminta untuk menghapus akun <strong>${BRAND_NAME}</strong> Anda secara permanen. Semua data akan dihapus dan tidak dapat dikembalikan.</p>
       ${button(url, "Hapus Akun Saya")}
       <p>Jika Anda tidak meminta ini, segera amankan akun Anda.</p>`,
    ),
  });
}

export async function sendOrganizationInvitationEmail(
  to: string,
  input: {
    id: string;
    role: string;
    inviterName: string;
    organizationName: string;
  },
) {
  const url = `${env.WEB_URL}/team/invite/${input.id}`;
  await sendEmail({
    to,
    subject: `${input.inviterName} mengundang Anda ke "${input.organizationName}" — ${BRAND_NAME}`,
    html: emailShell(
      `Undangan bergabung ke ${input.organizationName}`,
      `<p><strong>${input.inviterName}</strong> mengundang Anda untuk bergabung sebagai <strong>${input.role}</strong> di <strong>${input.organizationName}</strong> pada ${BRAND_NAME}.</p>
       ${button(url, "Terima Undangan")}
       <p>Undangan berlaku selama 48 jam.</p>`,
    ),
  });
}

export async function sendTwoFactorOtpEmail(to: string, otp: string) {
  await sendEmail({
    to,
    subject: `Kode verifikasi 2FA Anda — ${BRAND_NAME}`,
    html: emailShell(
      "Kode verifikasi dua faktor",
      `<p>Gunakan kode berikut untuk menyelesaikan verifikasi dua faktor Anda:</p>
       <p style="text-align:center;font-size:28px;font-weight:700;letter-spacing:8px;color:${ACCENT};margin:16px 0;">${otp}</p>
       <p>Kode berlaku selama 3 menit. Jangan bagikan kode ini kepada siapa pun.</p>`,
    ),
  });
}
