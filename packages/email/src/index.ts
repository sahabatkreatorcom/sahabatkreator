import { Resend } from "resend";

type EmailContent =
  | { html: string; text?: string; react?: never }
  | { html?: string; text: string; react?: never }
  | { react: React.ReactElement; html?: never; text?: never };

export type SendEmailOptions = EmailContent & {
  to: string | string[];
  subject: string;
  from?: string;
  replyTo?: string;
};

// Resend di-init lazy — `new Resend()` tanpa key langsung throw saat import,
// yang mematahkan `next build` (auth meng-import email di module scope).
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY belum dikonfigurasi. Email tidak dapat dikirim.");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendEmail(options: SendEmailOptions) {
  const { to, subject, from, replyTo, ...content } = options;
  const fromAddress = from || process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const { data, error } = await getResend().emails.send({
    from: fromAddress,
    to: Array.isArray(to) ? to : [to],
    subject,
    ...content,
    replyTo,
  });

  if (error) throw new Error(`Failed to send email: ${error.message}`);
  return { success: true, data };
}
