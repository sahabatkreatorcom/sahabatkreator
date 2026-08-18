// Template email HTML profesional untuk Sahabat Kreator.
// Semua inline-style (email client compatibility: Gmail/Outlook/Apple Mail).

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type EmailTemplateOptions = {
  greeting: string;
  intro: string;
  button?: { label: string; href: string };
  note?: string;
  otp?: string;
  outro?: string;
};

const BRAND = {
  name: "Sahabat Kreator",
  accent: "#D4A574",
  text: "#1F2937",
  muted: "#6B7280",
  bg: "#F9FAFB",
  card: "#FFFFFF",
  border: "#E5E7EB",
};

function layout({ greeting, intro, button, note, otp, outro }: EmailTemplateOptions): string {
  const hasCta = Boolean(button);
  const hasOtp = Boolean(otp);
  const showFallback = hasCta && button;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${BRAND.name}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px;background-color:${BRAND.text};border-bottom:3px solid ${BRAND.accent};">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:0.5px;">${BRAND.name}</td>
                </tr>
                <tr>
                  <td style="color:#9CA3AF;font-size:12px;margin-top:2px;">Platform Manajemen Media Sosial</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:${BRAND.text};font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">${greeting},</p>
              <p style="margin:0 0 20px;">${intro}</p>

              ${hasCta && button ? `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(button.href)}"
                       style="display:inline-block;background-color:${BRAND.accent};color:${BRAND.text};font-weight:600;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;">
                      ${escapeHtml(button.label)}
                    </a>
                  </td>
                </tr>
              </table>` : ""}

              ${hasOtp && otp ? `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;width:100%;">
                <tr>
                  <td align="center" style="background-color:${BRAND.bg};border:1px dashed ${BRAND.border};border-radius:8px;padding:20px;">
                    <span style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND.text};">${escapeHtml(otp)}</span>
                  </td>
                </tr>
              </table>` : ""}

              ${showFallback && button ? `
              <p style="margin:20px 0 0;font-size:13px;color:${BRAND.muted};">
                Tombol tidak berfungsi? Salin tautan berikut ke browser:
                <br />
                <a href="${escapeHtml(button.href)}" style="color:${BRAND.accent};word-break:break-all;">${escapeHtml(button.href)}</a>
              </p>` : ""}

              ${note ? `
              <p style="margin:20px 0 0;font-size:13px;color:${BRAND.muted};">${note}</p>` : ""}

              ${outro ? `<p style="margin:20px 0 0;">${outro}</p>` : ""}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:${BRAND.bg};border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;color:${BRAND.muted};line-height:1.5;">
                Email ini dikirim otomatis oleh ${BRAND.name}. Jika Anda tidak melakukan aksi ini,
                abaikan email ini dan tidak perlu membalas.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#9CA3AF;">&copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeUserText(value: string): string {
  return escapeHtml(value);
}

export const emailTemplates = {
  /** Verifikasi email setelah registrasi */
  verifyEmail({ name, url }: { name: string; url: string }): { subject: string; html: string } {
    return {
      subject: "Verifikasi email Anda",
      html: layout({
        greeting: `Halo ${escapeUserText(name)}`,
        intro:
          "Terima kasih telah mendaftar di Sahabat Kreator. Untuk mengaktifkan akun Anda, silakan konfirmasi alamat email dengan menekan tombol di bawah.",
        button: { label: "Verifikasi Email", href: url },
        note: "Tautan verifikasi berlaku selama 1 jam. Jika sudah kedaluwarsa, daftar ulang untuk mengirim tautan baru.",
        outro: "Setelah terverifikasi, Anda akan langsung masuk dan bisa mulai membuat konten.",
      }),
    };
  },

  /** Reset password */
  resetPassword({ name, url }: { name: string; url: string }): { subject: string; html: string } {
    return {
      subject: "Reset password Anda",
      html: layout({
        greeting: `Halo ${escapeUserText(name)}`,
        intro:
          "Kami menerima permintaan untuk mereset password akun Anda. Klik tombol di bawah untuk membuat password baru.",
        button: { label: "Reset Password", href: url },
        note: "Tautan ini berlaku selama 1 jam. Jika Anda tidak meminta reset password, abaikan email ini.",
      }),
    };
  },

  /** Undangan bergabung ke workspace */
  invitation({
    inviterName,
    organizationName,
    role,
    url,
  }: {
    inviterName: string;
    organizationName: string;
    role: string;
    url: string;
  }): { subject: string; html: string } {
    return {
      subject: `Undangan bergabung ke ${escapeUserText(organizationName)}`,
      html: layout({
        greeting: "Halo",
        intro: `${escapeUserText(inviterName)} mengundang Anda untuk bergabung ke workspace <b>${escapeUserText(organizationName)}</b> di Sahabat Kreator sebagai <b>${escapeUserText(role)}</b>.`,
        button: { label: "Terima Undangan", href: url },
        note: "Undangan berlaku selama 7 hari. Jika Anda tidak mengenali pengirimnya, abaikan email ini.",
      }),
    };
  },

  /** Kode OTP untuk 2FA */
  otp({ name, otp }: { name: string; otp: string }): { subject: string; html: string } {
    return {
      subject: "Kode verifikasi 2FA Anda",
      html: layout({
        greeting: `Halo ${escapeUserText(name)}`,
        intro: "Gunakan kode berikut untuk menyelesaikan verifikasi dua langkah (2FA):",
        otp,
        note: "Kode berlaku selama 5 menit dan hanya bisa digunakan sekali.",
      }),
    };
  },
};