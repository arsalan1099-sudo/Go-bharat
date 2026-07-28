// Email OTP client (Resend).
//
// Mirrors smsClient.ts / whatsappClient.ts so all three OTP delivery channels sit
// behind a small, uniform, independently-testable module. The client is created
// once at import time from RESEND_API_KEY; without the key, sends degrade
// gracefully (configured:false) instead of throwing.
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

if (apiKey) {
  console.log("Resend email client initialized successfully");
} else {
  console.warn("Resend not configured: RESEND_API_KEY not set");
}

export function isEmailConfigured(): boolean {
  return !!resend;
}

interface EmailOtpOptions {
  name?: string;
  role?: string;
  cleanPhone?: string;
}

// Sends the OTP verification email. Returns { sent:false } (never throws) when the
// client isn't configured, when the Resend API reports an error in its response,
// or when the request throws — so the caller can fall through / surface a real
// failure instead of a fake success.
export async function sendEmailOtp(
  toEmail: string,
  code: string,
  opts: EmailOtpOptions = {},
): Promise<{ sent: boolean; error?: string }> {
  if (!resend) {
    return { sent: false, error: "Resend not configured" };
  }

  const { name, role, cleanPhone } = opts;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  try {
    const { error } = await resend.emails.send({
      from: `Go Bharat <${fromEmail}>`,
      to: toEmail,
      subject: `${code} is your Go Bharat verification code`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #eee;">
          <div style="background: linear-gradient(135deg, #FF6B00, #FF8A33); padding: 32px 24px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Go Bharat</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Your Hyperlocal Super App</p>
          </div>
          <div style="padding: 32px 24px; text-align: center;">
            <p style="color: #333; font-size: 16px; margin: 0 0 8px;">Hello <strong>${name || "User"}</strong>,</p>
            <p style="color: #666; font-size: 14px; margin: 0 0 24px;">Use this code to verify your ${role || "account"} login:</p>
            <div style="background: #F8F9FA; border-radius: 12px; padding: 20px; margin: 0 0 24px; border: 2px dashed #FF6B00;">
              <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0B1E3D;">${code}</span>
            </div>
            <p style="color: #999; font-size: 12px; margin: 0;">This code expires in 5 minutes. Do not share it with anyone.</p>
          </div>
          <div style="background: #F8F9FA; padding: 16px 24px; text-align: center; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 11px; margin: 0;">Sent to ${toEmail}${cleanPhone ? ` for phone +91 ${cleanPhone}` : ""}</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Resend email error:", error.message || error);
      return { sent: false, error: error.message || "Failed to send email" };
    }
    return { sent: true };
  } catch (err: any) {
    console.error("Email send error:", err?.message || err);
    return { sent: false, error: err?.message || "Failed to send email" };
  }
}
