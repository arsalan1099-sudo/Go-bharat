/**
 * Production-mode devOtp tests for POST /api/otp/send.
 *
 * This is the production half of the contract whose development half lives in
 * otp-fallback.test.ts. It must be a SEPARATE file because routes.ts computes
 * IS_PRODUCTION once at module load (from REPLIT_DEPLOYMENT / NODE_ENV), so the
 * only way to load it with IS_PRODUCTION === true is in its own process with the
 * env set before import. node:test runs every file in its own child process, so
 * the two files never fight over the cached module.
 *
 * Production contract:
 *   - The raw code (devOtp) is NEVER returned in production — not when a channel
 *     succeeds, and NOT even when every channel fails — because that would leak
 *     the login code over the wire. On a total outage the client relies on
 *     deliveryFailed=true to show a "couldn't send" error instead.
 *
 * Run with:
 *   npx tsx --test --test-force-exit --experimental-test-module-mocks \
 *     server/__tests__/otp-fallback.prod.test.ts
 */
import test, { before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";

// Force production mode BEFORE routes.ts is imported so IS_PRODUCTION === true.
process.env.REPLIT_DEPLOYMENT = "1";

const ctrl = {
  whatsappConfigured: true,
  whatsappSent: true,
  smsConfigured: true,
  smsSent: true,
  emailThrows: false,
};

function resetCtrl() {
  ctrl.whatsappConfigured = true;
  ctrl.whatsappSent = true;
  ctrl.smsConfigured = true;
  ctrl.smsSent = true;
  ctrl.emailThrows = false;
}

mock.module("../whatsappClient.ts", {
  namedExports: {
    isWhatsAppConfigured: async () => ctrl.whatsappConfigured,
    isWhatsAppOrderConfigured: async () => false,
    sendWhatsAppOtp: async () => ({ sent: ctrl.whatsappSent, configured: ctrl.whatsappConfigured }),
    sendWhatsAppOrderConfirmation: async () => ({ sent: false, configured: false }),
  },
});

mock.module("../smsClient.ts", {
  namedExports: {
    isSmsConfigured: () => ctrl.smsConfigured,
    sendSmsOtp: async () => ({ sent: ctrl.smsSent }),
  },
});

mock.module("../emailClient.ts", {
  namedExports: {
    isEmailConfigured: () => true,
    sendEmailOtp: async () => {
      if (ctrl.emailThrows) return { sent: false, error: "simulated Resend failure" };
      return { sent: true };
    },
  },
});

let server: Server;
let baseUrl = "";

async function sendOtp(body: Record<string, unknown>): Promise<{ status: number; json: any }> {
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
function nextPhone(): string {
  phoneCounter++;
  return "97" + String(100000000 + phoneCounter).slice(-8);
}

before(async () => {
  const app = express();
  app.use(express.json());
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

test("devOtp is OMITTED in production when a channel delivers", async () => {
  ctrl.whatsappConfigured = true;
  ctrl.whatsappSent = true; // WhatsApp delivers

  const res = await sendOtp({ phone: nextPhone(), email: "user@example.com" });

  assert.equal(res.status, 200);
  assert.equal(res.json.deliveryFailed, false, "a channel delivered");
  assert.equal(
    Object.prototype.hasOwnProperty.call(res.json, "devOtp"),
    false,
    "the raw code must never be returned in production once a channel delivers",
  );
});

test("devOtp is OMITTED in production even when every channel fails (no leak on outage)", async () => {
  ctrl.whatsappConfigured = true;
  ctrl.whatsappSent = false;
  ctrl.smsConfigured = true;
  ctrl.smsSent = false;
  ctrl.emailThrows = true;

  const res = await sendOtp({ phone: nextPhone(), email: "user@example.com" });

  assert.equal(res.status, 200);
  assert.equal(res.json.deliveryFailed, true, "no channel delivered");
  assert.equal(
    Object.prototype.hasOwnProperty.call(res.json, "devOtp"),
    false,
    "the raw code must NEVER be returned in production, even on a total delivery outage",
  );
});
