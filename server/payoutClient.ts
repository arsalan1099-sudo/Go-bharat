import crypto from "crypto";

/**
 * Provider-agnostic payout (disbursement) client.
 *
 * Sends money OUT to a customer's UPI ID or bank account when an admin approves
 * a withdrawal. RazorpayX is the working provider (reuses the existing Razorpay
 * KEY_ID/KEY_SECRET + a funded RAZORPAYX_ACCOUNT_NUMBER). PhonePe Payouts is a
 * pluggable stub that errors explicitly until its (non-public) API spec and
 * dedicated credentials are supplied — we never guess a real-money API.
 */

export type PayoutProvider = "razorpayx" | "phonepe" | "manual";
export type PayoutMethod = "UPI" | "BANK";
// Normalized lifecycle independent of provider-specific status strings.
export type NormalizedPayoutStatus = "COMPLETED" | "PROCESSING" | "FAILED";

export interface PayoutDestination {
  method: PayoutMethod;
  upiId?: string;
  accountNumber?: string;
  ifsc?: string;
}

export interface CreatePayoutInput {
  withdrawalId: string;
  amountInr: number;
  destination: PayoutDestination;
  beneficiaryName: string;
  contactNumber?: string;
  idempotencyKey: string;
}

export interface PayoutResult {
  success: boolean;
  /** Provider payout id (e.g. RazorpayX pout_xxx). */
  ref?: string;
  /** Raw provider status string (queued/processed/...). */
  rawStatus?: string;
  /** Normalized status derived from rawStatus. */
  normalizedStatus?: NormalizedPayoutStatus;
  error?: string;
  /**
   * true when the provider is not usable (missing creds / stub). Caller should
   * revert the withdrawal to PENDING and surface a configuration error.
   */
  notConfigured?: boolean;
  /**
   * true when the outcome is UNKNOWN (network error / timeout) — the payout MAY
   * have been created. Caller must NOT revert/refund; leave it PROCESSING and let
   * the webhook (or an idempotent retry with the same key) resolve it.
   */
  ambiguous?: boolean;
}

const RAZORPAYX_BASE = "https://api.razorpay.com/v1/payouts";

/** Which provider automated payouts should use. Defaults to manual (no auto-disbursement). */
export function getConfiguredPayoutProvider(): PayoutProvider {
  const raw = (process.env.PAYOUT_PROVIDER || "").trim().toLowerCase();
  if (raw === "razorpayx" || raw === "phonepe" || raw === "manual") return raw;
  // Auto-detect: if RazorpayX is fully configured, prefer it; else stay manual.
  if (isRazorpayXConfigured()) return "razorpayx";
  return "manual";
}

export function isRazorpayXConfigured(): boolean {
  return !!(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAYX_ACCOUNT_NUMBER
  );
}

export function isPhonePePayoutConfigured(): boolean {
  // PhonePe Payouts is an enterprise product with a non-public API. We only treat
  // it as configured when an explicit endpoint has been provided alongside creds.
  return !!(
    process.env.PHONEPE_PAYOUT_ENDPOINT &&
    process.env.PHONEPE_MERCHANT_ID &&
    process.env.PHONEPE_SALT_KEY &&
    process.env.PHONEPE_SALT_INDEX
  );
}

function normalizeRazorpayXStatus(status: string): NormalizedPayoutStatus {
  const s = (status || "").toLowerCase();
  if (s === "processed") return "COMPLETED";
  if (["reversed", "cancelled", "rejected", "failed"].includes(s)) return "FAILED";
  // queued, pending, processing, created, scheduled, etc.
  return "PROCESSING";
}

async function createRazorpayXPayout(input: CreatePayoutInput): Promise<PayoutResult> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!keyId || !keySecret || !accountNumber) {
    return { success: false, notConfigured: true, error: "RazorpayX not configured (missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAYX_ACCOUNT_NUMBER)" };
  }

  const isUpi = input.destination.method === "UPI";
  const fundAccount: Record<string, any> = {
    account_type: isUpi ? "vpa" : "bank_account",
    contact: {
      name: input.beneficiaryName || "Go Bharat User",
      type: "customer",
      ...(input.contactNumber ? { contact: input.contactNumber } : {}),
    },
  };
  if (isUpi) {
    fundAccount.vpa = { address: input.destination.upiId };
  } else {
    fundAccount.bank_account = {
      name: input.beneficiaryName || "Go Bharat User",
      ifsc: input.destination.ifsc,
      account_number: input.destination.accountNumber,
    };
  }

  const body = {
    account_number: accountNumber,
    amount: Math.round(input.amountInr * 100),
    currency: "INR",
    mode: isUpi ? "UPI" : "IMPS",
    purpose: "payout",
    fund_account: fundAccount,
    queue_if_low_balance: true,
    reference_id: `withdrawal_${input.withdrawalId}`,
    narration: "Go Bharat Withdrawal",
    notes: { withdrawal_id: input.withdrawalId },
  };

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(RAZORPAYX_BASE, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        // Mandatory for all payout requests since 2025-03-15. Same key => same payout.
        "X-Payout-Idempotency": input.idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    // Network/timeout: the payout MAY have been created. Do not revert/refund.
    return { success: false, ambiguous: true, error: err?.message || "Network error contacting RazorpayX" };
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // Got an HTTP response we couldn't parse — treat as ambiguous (could be a gateway hiccup).
    return { success: false, ambiguous: true, error: `Unparseable RazorpayX response (HTTP ${response.status})` };
  }

  if (data && data.id) {
    const rawStatus = data.status || "queued";
    return {
      success: true,
      ref: data.id,
      rawStatus,
      normalizedStatus: normalizeRazorpayXStatus(rawStatus),
    };
  }

  // Definite, server-acknowledged failure (validation, insufficient balance, etc.)
  // — no payout was created, so the caller can safely revert to PENDING.
  return {
    success: false,
    error: data?.error?.description || `RazorpayX payout failed (HTTP ${response.status})`,
  };
}

async function createPhonePePayout(_input: CreatePayoutInput): Promise<PayoutResult> {
  // PhonePe Payouts/Disbursement is an enterprise product whose API is NOT publicly
  // documented and requires dedicated credentials + endpoint from PhonePe onboarding.
  // Until PHONEPE_PAYOUT_ENDPOINT (and the verified request/callback contract) is
  // supplied, we refuse rather than guess a real-money API.
  return {
    success: false,
    notConfigured: true,
    error: "PhonePe Payouts is not configured. Provide the PhonePe Payouts endpoint + credentials, or use RazorpayX.",
  };
}

/** Dispatch a payout to the configured provider. */
export async function createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
  const provider = getConfiguredPayoutProvider();
  if (provider === "razorpayx") return createRazorpayXPayout(input);
  if (provider === "phonepe") return createPhonePePayout(input);
  return { success: false, notConfigured: true, error: "Automated payouts are disabled (PAYOUT_PROVIDER=manual)." };
}

/** Verify a RazorpayX webhook signature (HMAC-SHA256 of the raw body). */
export function verifyPayoutWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // timingSafeEqual requires equal-length buffers.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export { normalizeRazorpayXStatus };
