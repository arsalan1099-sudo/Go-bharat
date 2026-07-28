import crypto from "crypto";

const merchantId = process.env.PHONEPE_MERCHANT_ID;
const saltKey = process.env.PHONEPE_SALT_KEY;
const saltIndex = parseInt(process.env.PHONEPE_SALT_INDEX || "1", 10);
const IS_PRODUCTION = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";

const BASE_URL = IS_PRODUCTION
  ? "https://api.phonepe.com/apis/hermes"
  : "https://api-preprod.phonepe.com/apis/pg-sandbox";

if (merchantId && saltKey) {
  console.log("PhonePe client initialized successfully");
} else {
  console.warn("PhonePe not configured: PHONEPE_MERCHANT_ID or PHONEPE_SALT_KEY not set");
}

export function isPhonePeConfigured(): boolean {
  return !!(merchantId && saltKey);
}

export async function createPhonePeOrder(
  amountInr: number,
  transactionId: string,
  redirectUrl: string,
  callbackUrl: string,
  mobileNumber?: string
): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  if (!merchantId || !saltKey) {
    return { success: false, error: "PhonePe not configured" };
  }

  const payload = {
    merchantId,
    merchantTransactionId: transactionId,
    merchantUserId: `MUID_${transactionId}`,
    amount: Math.round(amountInr * 100),
    redirectUrl,
    redirectMode: "REDIRECT",
    callbackUrl,
    mobileNumber: mobileNumber || "",
    paymentInstrument: {
      type: "PAY_PAGE",
    },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
  const endpoint = "/pg/v1/pay";
  const checksum =
    crypto
      .createHash("sha256")
      .update(base64Payload + endpoint + saltKey)
      .digest("hex") + `###${saltIndex}`;

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    const data = (await response.json()) as any;

    if (data.success && data.data?.instrumentResponse?.redirectInfo?.url) {
      return { success: true, paymentUrl: data.data.instrumentResponse.redirectInfo.url };
    } else {
      return { success: false, error: data.message || "Failed to initiate PhonePe payment" };
    }
  } catch (err: any) {
    console.error("PhonePe order creation error:", err?.message || err);
    return { success: false, error: err?.message || "Failed to create PhonePe order" };
  }
}

export async function fetchPhonePeStatus(
  transactionId: string
): Promise<{ success: boolean; status?: "paid" | "pending" | "failed"; error?: string }> {
  if (!merchantId || !saltKey) {
    return { success: false, error: "PhonePe not configured" };
  }

  const endpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
  const checksum =
    crypto
      .createHash("sha256")
      .update(endpoint + saltKey)
      .digest("hex") + `###${saltIndex}`;

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": merchantId,
      },
    });

    const data = (await response.json()) as any;

    if (data.success) {
      const txnState = data.data?.state || "";
      if (txnState === "COMPLETED") return { success: true, status: "paid" };
      if (txnState === "FAILED") return { success: true, status: "failed" };
      return { success: true, status: "pending" };
    } else {
      return { success: true, status: "pending" };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to fetch PhonePe status" };
  }
}

export function verifyPhonePeCallbackChecksum(encodedResponse: string, xVerify: string): boolean {
  if (!saltKey) return false;
  const expectedChecksum =
    crypto
      .createHash("sha256")
      .update(encodedResponse + saltKey)
      .digest("hex") + `###${saltIndex}`;
  return expectedChecksum === xVerify;
}
