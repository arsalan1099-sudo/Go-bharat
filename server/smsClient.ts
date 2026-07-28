const apiKey = process.env.FAST2SMS_API_KEY;

if (apiKey) {
  console.log("Fast2SMS client initialized successfully");
} else {
  console.warn("Fast2SMS not configured: FAST2SMS_API_KEY not set");
}

export function isSmsConfigured(): boolean {
  return !!apiKey;
}

export async function sendSmsOtp(toPhone: string, code: string): Promise<{ sent: boolean; error?: string }> {
  if (!apiKey) {
    return { sent: false, error: "Fast2SMS not configured" };
  }

  try {
    const cleanPhone = toPhone.replace(/\D/g, "").slice(-10);

    if (cleanPhone.length !== 10) {
      return { sent: false, error: "Invalid phone number" };
    }

    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        "authorization": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "q",
        message: `${code} is your Go Bharat verification code. Valid for 5 minutes. Do not share with anyone.`,
        flash: 0,
        numbers: cleanPhone,
      }),
    });

    const data = await response.json() as { return: boolean; message: string; request_id?: string };

    if (data.return) {
      console.log(`Fast2SMS OTP sent to ${cleanPhone} (request_id: ${data.request_id})`);
      return { sent: true };
    } else {
      console.error("Fast2SMS error:", data.message);
      return { sent: false, error: data.message || "Fast2SMS delivery failed" };
    }
  } catch (err: any) {
    console.error("Fast2SMS error:", err?.message || err);
    return { sent: false, error: err?.message || "Failed to send SMS" };
  }
}
