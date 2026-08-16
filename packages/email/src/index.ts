import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

export async function sendEmail(options: SendEmailOptions) {
  const { to, subject, from, replyTo, ...content } = options;
  const fromAddress = from || process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: Array.isArray(to) ? to : [to],
    subject,
    ...content,
    replyTo,
  });

  if (error) throw new Error(`Failed to send email: ${error.message}`);
  return { success: true, data };
}

export { resend };
