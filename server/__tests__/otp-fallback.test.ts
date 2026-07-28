/**
 * Delivery-fallback tests for POST /api/otp/send.
 *
 * The login OTP endpoint must try its delivery channels in a strict cascade —
 * WhatsApp first, then SMS, then email — and stop the moment one channel
 * accepts the message. If every channel fails it must flag deliveryFailed so the
 * client can show a real error instead of a fake success.
 *
 * These channels (WhatsApp / Fast2SMS / Resend) all hit third-party APIs, so the
 * real senders are replaced with node:test module mocks. A shared `ctrl` object
 * lets each test script exactly which channels are "configured" and which
 * "deliver", and counts how many times each sender was actually invoked so we can
 * prove the short-circuit (later channels are never even called once an earlier
 * one succeeds).
 *
 * This file runs in DEVELOPMENT mode (NODE_ENV !== production, REPLIT_DEPLOYMENT
 * unset), so it also asserts that the raw code (devOtp) is returned on screen —
 * the production-omission half of that contract lives in
 * otp-fallback.prod.test.ts, which must run in its own process to load routes.ts
 * with IS_PRODUCTION baked to true.
 *
 * Run with:
 *   npx tsx --test --test-force-exit --experimental-test-module-mocks \
 *     server/__tests__/otp-fallback.test.ts
 *
 * Note on --test-force-exit: registerRoutes() starts a background cache-refresh
 * interval and a keep-alive pg pool that hold the event loop open after the suite
 * finishes. --test-force-exit exits once all tests/hooks complete while STILL
 * honoring the real pass/fail exit code (unlike process.exit()).
 */
import test, { before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";

// Make sure routes.ts loads in development mode so devOtp is always returned.
delete process.env.REPLIT_DEPLOYMENT;
process.env.NODE_ENV = "development";

// Shared, per-test mutable control of the (mocked) delivery channels.
const ctrl = {
  whatsappConfigured: true,
  whatsappSent: true,
  smsConfigured: true,
  smsSent: true,
  emailThrows: false,
  whatsappCalls: 0,
  smsCalls: 0,
  emailCalls: 0,
};

function resetCtrl() {
  ctrl.whatsappConfigured = true;
  ctrl.whatsappSent = true;
  ctrl.smsConfigured = true;
  ctrl.smsSent = true;
  ctrl.emailThrows = false;
  ctrl.whatsappCalls = 0;
  ctrl.smsCalls = 0;
  ctrl.emailCalls = 0;
}

mock.module("../whatsappClient.ts", {
  namedExports: {
    isWhatsAppConfigured: async () => ctrl.whatsappConfigured,
    isWhatsAppOrderConfigured: async () => false,
    sendWhatsAppOtp: async () => {
      ctrl.whatsappCalls++;
      return { sent: ctrl.whatsappSent, configured: ctrl.whatsappConfigured };
    },
    sendWhatsAppOrderConfirmation: async () => ({ sent: false, configured: false }),
  },
});

mock.module("../smsClient.ts", {
  namedExports: {
    isSmsConfigured: () => ctrl.smsConfigured,
    sendSmsOtp: async () => {
      ctrl.smsCalls++;
      return { sent: ctrl.smsSent };
    },
  },
});

mock.module("../emailClient.ts", {
  namedExports: {
    isEmailConfigured: () => true,
    sendEmailOtp: async () => {
      ctrl.emailCalls++;
      if (ctrl.emailThrows) return { sent: false, error: "simulated Resend failure" };
      return { sent: true };
    },
  },
});

let server: Server;
let baseUrl = "";

interface ApiResult {
  status: number;
  json: any;
}

async function sendOtp(body: Record<string, unknown>): Promise<ApiResult> {
  const res = await fetch(`${baseUrl}/api/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

let phoneCounter = 0;
/** Unique 10-digit phone per call so the per-phone rate limiter never trips. */
function nextPhone(): string {
  phoneCounter++;
  return "98" + String(100000000 + phoneCounter).slice(-8);
}

before(async () => {
  const app = express();
  app.use(express.json());
  // Import AFTER the mocks above are registered so routes.ts picks up the mocked
  // delivery clients and the mocked Resend package.
  const { registerRoutes } = await import("../routes.ts");
  await registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (addr && typeof addr === "object") {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error("Failed to bind test server");
  }
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => resetCtrl());

test("WhatsApp success short-circuits SMS and email", async () => {
  ctrl.whatsappConfigured = true;
  ctrl.whatsappSent = true;

  const res = await sendOtp({ phone: nextPhone(), email: "user@example.com" });

  assert.equal(res.status, 200);
  assert.equal(res.json.whatsappSent, true, "WhatsApp delivered");
  assert.equal(res.json.smsSent, false, "SMS must not be marked sent");
  assert.equal(res.json.emailSent, false, "email must not be marked sent");
  assert.equal(res.json.deliveryFailed, false, "a channel delivered");
  assert.equal(ctrl.whatsappCalls, 1, "WhatsApp attempted exactly once");
  assert.equal(ctrl.smsCalls, 0, "SMS never attempted after WhatsApp success");
  assert.equal(ctrl.emailCalls, 0, "email never attempted after WhatsApp success");
});

test("WhatsApp failure falls through to SMS (email not attempted)", async () => {
  ctrl.whatsappConfigured = true;
  ctrl.whatsappSent = false; // WhatsApp configured but delivery fails
  ctrl.smsConfigured = true;
  ctrl.smsSent = true;

  const res = await sendOtp({ phone: nextPhone(), email: "user@example.com" });

  assert.equal(res.status, 200);
  assert.equal(res.json.whatsappSent, false, "WhatsApp failed");
  assert.equal(res.json.smsSent, true, "SMS picked up the fallback");
  assert.equal(res.json.emailSent, false, "email must not run once SMS delivered");
  assert.equal(res.json.deliveryFailed, false, "SMS delivered");
  assert.equal(ctrl.whatsappCalls, 1, "WhatsApp attempted once");
  assert.equal(ctrl.smsCalls, 1, "SMS attempted once");
  assert.equal(ctrl.emailCalls, 0, "email never attempted after SMS success");
});

test("WhatsApp + SMS both fail falls through to email", async () => {
  ctrl.whatsappConfigured = true;
  ctrl.whatsappSent = false;
  ctrl.smsConfigured = true;
  ctrl.smsSent = false;
  ctrl.emailThrows = false; // email succeeds

  const res = await sendOtp({ phone: nextPhone(), email: "user@example.com" });

  assert.equal(res.status, 200);
  assert.equal(res.json.whatsappSent, false, "WhatsApp failed");
  assert.equal(res.json.smsSent, false, "SMS failed");
  assert.equal(res.json.emailSent, true, "email is the final fallback");
  assert.equal(res.json.deliveryFailed, false, "email delivered");
  assert.equal(ctrl.whatsappCalls, 1, "WhatsApp attempted once");
  assert.equal(ctrl.smsCalls, 1, "SMS attempted once");
  assert.equal(ctrl.emailCalls, 1, "email attempted once");
});

test("deliveryFailed is true when every channel fails", async () => {
  ctrl.whatsappConfigured = true;
  ctrl.whatsappSent = false;
  ctrl.smsConfigured = true;
  ctrl.smsSent = false;
  ctrl.emailThrows = true; // email throws too

  const res = await sendOtp({ phone: nextPhone(), email: "user@example.com" });

  assert.equal(res.status, 200);
  assert.equal(res.json.whatsappSent, false);
  assert.equal(res.json.smsSent, false);
  assert.equal(res.json.emailSent, false);
  assert.equal(res.json.deliveryFailed, true, "no channel delivered");
  assert.ok(res.json.emailError, "email failure is surfaced");
  assert.equal(ctrl.whatsappCalls, 1, "WhatsApp attempted once");
  assert.equal(ctrl.smsCalls, 1, "SMS attempted once");
  assert.equal(ctrl.emailCalls, 1, "email attempted once");
});

test("devOtp IS returned in development (NODE_ENV !== production)", async () => {
  ctrl.whatsappConfigured = true;
  ctrl.whatsappSent = true; // a channel succeeds, yet dev still exposes the code

  const res = await sendOtp({ phone: nextPhone(), email: "user@example.com" });

  assert.equal(res.status, 200);
  assert.equal(res.json.deliveryFailed, false, "delivery succeeded");
  assert.ok(
    typeof res.json.devOtp === "string" && /^\d{6}$/.test(res.json.devOtp),
    `devOtp must be a 6-digit code in dev (got ${res.json.devOtp})`,
  );
});
