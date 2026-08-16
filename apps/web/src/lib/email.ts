import { sendEmail as _sendEmail, resend as _resend, type SendEmailOptions as _SendEmailOptions } from "@sahabat-kreator/email";

export { _sendEmail as sendEmail, _resend as resend };
export type { _SendEmailOptions as SendEmailOptions };

/**
 * Get the Resend client instance for advanced usage
 */
export function getResendClient() {
  return _resend;
}
