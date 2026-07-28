/**
 * Concurrency / money-safety tests for the withdrawal endpoints.
 *
 * These run against a REAL Postgres (the same DATABASE_URL the server uses) because the
 * guarantees being tested — per-row status locking and the per-user advisory lock around the
 * check-and-debit — only exist inside the database. They cannot be mocked.
 *
 * Scenario 1 — "two admins can't double-pay a withdrawal":
 *   Fire PATCH /complete and PATCH /reject for the SAME request at the same time. Exactly one
 *   must win, and at most ONE refund credit may ever be created. A request must never end up
 *   both COMPLETED and refunded (that would mint money).
 *
 * Scenario 2 — "concurrent requests can't over-withdraw the same balance":
 *   Fire several POST /request for the same user at once. The total amount debited must never
 *   exceed the wallet balance available before they ran.
 *
 * Run with:  npx tsx --test --test-force-exit server/__tests__/withdrawals.concurrency.test.ts
 *
 * Note on --test-force-exit: registerRoutes() starts a background cache-refresh interval and a
 * keep-alive pg pool (allowExitOnIdle:false) that would otherwise hold the event loop open after
 * the suite finishes. --test-force-exit makes node:test exit once all tests/hooks complete while
 * STILL honoring the real pass/fail exit code — unlike a manual process.exit(), which would mask
 * a failing run as green.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import { and, eq, like } from "drizzle-orm";

import { db } from "../db";
import { registerRoutes } from "../routes";
import { generateToken } from "../auth";
import { withdrawalRequests, walletTransactions } from "@shared/schema";

const RUN_ID = `wdtest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const ADMIN_TOKEN = generateToken("9999999999", "SUPER_ADMIN", "admin");

let server: Server;
let baseUrl = "";
const seededUserIds: string[] = [];

interface ApiResult {
  status: number;
  json: any;
}

async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<ApiResult> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** Sum of CREDIT minus DEBIT for a user — the same formula the server uses. */
async function walletBalance(userId: string): Promise<number> {
  const txns = await db
    .select({ type: walletTransactions.type, amount: walletTransactions.amount })
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, userId));
  return txns.reduce((sum, t) => sum + (t.type === "CREDIT" ? t.amount : -t.amount), 0);
}

/** Seed an opening balance by inserting a single CREDIT ledger row. */
async function seedBalance(userId: string, amount: number): Promise<void> {
  seededUserIds.push(userId);
  await db.insert(walletTransactions).values({
    id: `${userId}_seed`,
    userId,
    type: "CREDIT",
    amount,
    reference: `Test Seed:${userId}`,
  });
}

async function countRefunds(withdrawalId: string): Promise<number> {
  const rows = await db
    .select({ id: walletTransactions.id })
    .from(walletTransactions)
    .where(eq(walletTransactions.reference, `Withdrawal Refund:${withdrawalId}`));
  return rows.length;
}

before(async () => {
  const app = express();
  app.use(express.json());
  await registerRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error("Failed to bind test server");
  }
});

after(async () => {
  // Remove every row this test inserted so the dev DB stays clean.
  for (const userId of seededUserIds) {
    await db.delete(walletTransactions).where(eq(walletTransactions.userId, userId));
    await db.delete(withdrawalRequests).where(eq(withdrawalRequests.userId, userId));
  }
  // Belt-and-braces: catch any ledger rows keyed by the run id namespace.
  await db.delete(walletTransactions).where(like(walletTransactions.userId, `${RUN_ID}%`));
  await db.delete(withdrawalRequests).where(like(withdrawalRequests.userId, `${RUN_ID}%`));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // No process.exit() here — that would override node:test's exit code and could report a
  // failing run as green. The leftover keep-alive pg pool + background cache interval started by
  // registerRoutes are handled by the --test-force-exit runner flag, which exits once all hooks
  // finish while preserving the real pass/fail status.
});

test("concurrent complete + reject: exactly one wins, at most one refund (no double-pay)", async () => {
  const userId = `${RUN_ID}_a`;
  const userToken = generateToken(userId, "DELIVERY", userId);
  await seedBalance(userId, 5000);

  // Create the pending withdrawal — this holds (debits) ₹1000 immediately.
  const created = await api("POST", "/api/withdrawals/request", userToken, {
    userId,
    userName: "Test User A",
    userRole: "DELIVERY",
    amount: 1000,
    method: "UPI",
    bankDetails: { upiId: "test@upi" },
  });
  assert.equal(created.status, 200, `request should succeed: ${JSON.stringify(created.json)}`);
  const wid: string = created.json.withdrawal.id;
  assert.equal(await walletBalance(userId), 4000, "balance held after request");

  // Two admins act at the same instant: one completes, one rejects.
  const [completeRes, rejectRes] = await Promise.all([
    api("PATCH", `/api/withdrawals/${wid}/complete`, ADMIN_TOKEN, {}),
    api("PATCH", `/api/withdrawals/${wid}/reject`, ADMIN_TOKEN, { reason: "test reject" }),
  ]);

  const winners = [completeRes, rejectRes].filter((r) => r.status === 200);
  const losers = [completeRes, rejectRes].filter((r) => r.status === 409);
  assert.equal(winners.length, 1, `exactly one call must win (got ${winners.length})`);
  assert.equal(losers.length, 1, "the other call must lose with 409 conflict");

  // The row settles into exactly one terminal state.
  const [row] = await db
    .select()
    .from(withdrawalRequests)
    .where(eq(withdrawalRequests.id, wid));
  assert.ok(row, "withdrawal row exists");
  assert.ok(
    row.status === "COMPLETED" || row.status === "REJECTED",
    `terminal status expected, got ${row.status}`,
  );

  // The money-critical invariant: at most one refund credit, and it exists IFF rejected.
  const refunds = await countRefunds(wid);
  assert.ok(refunds <= 1, `at most one refund credit (got ${refunds})`);

  const finalBalance = await walletBalance(userId);
  if (row.status === "COMPLETED") {
    assert.equal(refunds, 0, "completed withdrawal must NOT be refunded");
    assert.equal(finalBalance, 4000, "completed: ₹1000 stays debited");
  } else {
    assert.equal(refunds, 1, "rejected withdrawal must be refunded exactly once");
    assert.equal(finalBalance, 5000, "rejected: held ₹1000 credited back");
  }
});

test("concurrent reject + reject: refund credited only once (idempotent)", async () => {
  const userId = `${RUN_ID}_b`;
  const userToken = generateToken(userId, "DELIVERY", userId);
  await seedBalance(userId, 5000);

  const created = await api("POST", "/api/withdrawals/request", userToken, {
    userId,
    userName: "Test User B",
    userRole: "DELIVERY",
    amount: 2000,
    method: "UPI",
    bankDetails: { upiId: "test@upi" },
  });
  assert.equal(created.status, 200, `request should succeed: ${JSON.stringify(created.json)}`);
  const wid: string = created.json.withdrawal.id;

  // Two admins reject the same request simultaneously.
  const results = await Promise.all([
    api("PATCH", `/api/withdrawals/${wid}/reject`, ADMIN_TOKEN, { reason: "dup 1" }),
    api("PATCH", `/api/withdrawals/${wid}/reject`, ADMIN_TOKEN, { reason: "dup 2" }),
  ]);
  const winners = results.filter((r) => r.status === 200);
  assert.equal(winners.length, 1, "only one reject can win");

  assert.equal(await countRefunds(wid), 1, "exactly one refund credit despite two rejects");
  assert.equal(await walletBalance(userId), 5000, "balance restored to original, not over-credited");
});

test("concurrent requests can't over-withdraw the same wallet balance", async () => {
  const userId = `${RUN_ID}_c`;
  const userToken = generateToken(userId, "DELIVERY", userId);
  const opening = 1000;
  await seedBalance(userId, opening);

  // Fire 5 requests of ₹600 at once. Balance only covers one (600 ≤ 1000; 2×600 = 1200 > 1000).
  const reqAmount = 600;
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () =>
      api("POST", "/api/withdrawals/request", userToken, {
        userId,
        userName: "Test User C",
        userRole: "DELIVERY",
        amount: reqAmount,
        method: "UPI",
        bankDetails: { upiId: "test@upi" },
      }),
    ),
  );

  const successes = attempts.filter((r) => r.status === 200);
  assert.equal(successes.length, 1, `only one request fits the balance (got ${successes.length})`);

  // Sum every DEBIT actually written for this user's withdrawal holds.
  const debitRows = await db
    .select({ amount: walletTransactions.amount })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.userId, userId),
        eq(walletTransactions.type, "DEBIT"),
      ),
    );
  const totalDebited = debitRows.reduce((s, r) => s + r.amount, 0);
  assert.ok(
    totalDebited <= opening,
    `total debited (${totalDebited}) must not exceed opening balance (${opening})`,
  );
  assert.equal(totalDebited, reqAmount, "exactly one hold of ₹600 was placed");

  const finalBalance = await walletBalance(userId);
  assert.ok(finalBalance >= 0, `balance must never go negative (got ${finalBalance})`);
  assert.equal(finalBalance, opening - reqAmount, "balance reflects exactly one successful hold");
});
