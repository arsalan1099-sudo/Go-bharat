import crypto from "crypto";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (keyId && keySecret) {
  console.log("Razorpay client initialized successfully");
} else {
  console.warn("Razorpay not configured: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set");
}

export function isRazorpayConfigured(): boolean {
  return !!(keyId && keySecret);
}

export function getRazorpayKeyId(): string {
  return keyId || "";
}

export async function createRazorpayOrder(amountInr: number, orderId: string, notes?: Record<string, string>): Promise<{ success: boolean; order?: any; error?: string }> {
  if (!keyId || !keySecret) {
    return { success: false, error: "Razorpay not configured" };
  }

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amountInr * 100),
        currency: "INR",
        receipt: orderId,
        notes: notes || { platform: "go_bharat" },
      }),
    });

    const data = await response.json();

    if (data.id) {
      return { success: true, order: data };
    } else {
      return { success: false, error: data.error?.description || "Failed to create order" };
    }
  } catch (err: any) {
    console.error("Razorpay order creation error:", err?.message || err);
    return { success: false, error: err?.message || "Failed to create Razorpay order" };
  }
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!keySecret) return false;

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");

  return expectedSignature === signature;
}

export async function fetchRazorpayPayment(paymentId: string): Promise<{ success: boolean; payment?: any; error?: string }> {
  if (!keyId || !keySecret) {
    return { success: false, error: "Razorpay not configured" };
  }

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: {
        "Authorization": `Basic ${auth}`,
      },
    });

    const data = await response.json();
    if (data.id) {
      return { success: true, payment: data };
    } else {
      return { success: false, error: data.error?.description || "Payment not found" };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to fetch payment" };
  }
}

export async function refundRazorpayPayment(paymentId: string, amountInr?: number): Promise<{ success: boolean; refund?: any; error?: string }> {
  if (!keyId || !keySecret) {
    return { success: false, error: "Razorpay not configured" };
  }

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const body: any = {};
    if (amountInr) {
      body.amount = Math.round(amountInr * 100);
    }

    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (data.id) {
      return { success: true, refund: data };
    } else {
      return { success: false, error: data.error?.description || "Refund failed" };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to process refund" };
  }
}
