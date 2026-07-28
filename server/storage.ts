import { type User, type InsertUser, appUsers, otpCodes, pushTokens, notifications, vendors, products, orders, orderItems, reviews, teamMembers, vendorApplications, categories, subCategories } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gt, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  storeOtp(phone: string, code: string, email?: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<boolean>;
  cleanExpiredOtps(): Promise<void>;

  storePushToken(userId: string, token: string, platform: string, role?: string): Promise<void>;
  getPushToken(userId: string): Promise<{ token: string; platform: string; role?: string } | null>;
  getAllPushTokens(): Promise<Array<{ userId: string; token: string; platform: string }>>;
  getPushTokensByRole(role: string): Promise<Array<{ userId: string; token: string; platform: string }>>;

  storeNotification(notif: { id: string; title: string; message: string; targetRole: string; targetUserId?: string }): Promise<void>;
  getNotifications(limit: number): Promise<any[]>;
  getUnreadCount(userId: string): Promise<number>;
  markNotificationRead(notifId: string): Promise<void>;

  deleteUserAccount(userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
    return user ? { id: user.id, username: user.name, password: "" } : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(appUsers).where(eq(appUsers.name, username)).limit(1);
    return user ? { id: user.id, username: user.name, password: "" } : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    return user;
  }

  async storeOtp(phone: string, code: string, email?: string): Promise<void> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await db.insert(otpCodes).values({
      id,
      phone,
      code,
      email: email || null,
      expiresAt,
      verified: false,
    });
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const now = new Date();
    const [otp] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, phone),
          eq(otpCodes.code, code),
          eq(otpCodes.verified, false),
          gt(otpCodes.expiresAt, now)
        )
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (!otp) return false;

    await db.update(otpCodes).set({ verified: true }).where(eq(otpCodes.id, otp.id));
    return true;
  }

  async cleanExpiredOtps(): Promise<void> {
    const now = new Date();
    await db.delete(otpCodes).where(gt(now, otpCodes.expiresAt));
  }

  async storePushToken(userId: string, token: string, platform: string, role?: string): Promise<void> {
    await db
      .insert(pushTokens)
      .values({ userId, token, platform, role: role || "" })
      .onConflictDoUpdate({
        target: pushTokens.userId,
        set: { token, platform, ...(role !== undefined ? { role: role || "" } : {}) },
      });
  }

  async getPushToken(userId: string): Promise<{ token: string; platform: string; role?: string } | null> {
    const [result] = await db.select().from(pushTokens).where(eq(pushTokens.userId, userId)).limit(1);
    return result ? { token: result.token, platform: result.platform, role: result.role || "" } : null;
  }

  async getAllPushTokens(): Promise<Array<{ userId: string; token: string; platform: string }>> {
    return db.select({
      userId: pushTokens.userId,
      token: pushTokens.token,
      platform: pushTokens.platform,
    }).from(pushTokens);
  }

  async getPushTokensByRole(role: string): Promise<Array<{ userId: string; token: string; platform: string }>> {
    return db.select({
      userId: pushTokens.userId,
      token: pushTokens.token,
      platform: pushTokens.platform,
    }).from(pushTokens).where(eq(pushTokens.role, role));
  }

  async storeNotification(notif: { id: string; title: string; message: string; targetRole: string; targetUserId?: string }): Promise<void> {
    await db.insert(notifications).values({
      id: notif.id,
      title: notif.title,
      message: notif.message,
      targetRole: notif.targetRole,
      targetUserId: notif.targetUserId || null,
      read: false,
    });
  }

  async getNotifications(limit: number): Promise<any[]> {
    return db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.sentAt))
      .limit(limit);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.read, false));
    return result[0]?.count || 0;
  }

  async markNotificationRead(notifId: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, notifId));
  }

  async deleteUserAccount(userId: string): Promise<boolean> {
    try {
      await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
      await db.delete(notifications).where(eq(notifications.targetUserId, userId));
      await db.delete(reviews).where(eq(reviews.userId, userId));
      await db.delete(appUsers).where(eq(appUsers.id, userId));
      return true;
    } catch (error) {
      console.error("Delete user account error:", error);
      return false;
    }
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private otpStore: Map<string, { code: string; expiresAt: number; email?: string }>;
  private pushTokenStore: Map<string, { token: string; platform: string; role?: string }>;
  private notificationStore: any[];

  constructor() {
    this.users = new Map();
    this.otpStore = new Map();
    this.pushTokenStore = new Map();
    this.notificationStore = [];
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async storeOtp(phone: string, code: string, email?: string): Promise<void> {
    this.otpStore.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000, email });
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const stored = this.otpStore.get(phone);
    if (!stored) return false;
    if (stored.expiresAt < Date.now()) {
      this.otpStore.delete(phone);
      return false;
    }
    if (stored.code !== code) return false;
    this.otpStore.delete(phone);
    return true;
  }

  async cleanExpiredOtps(): Promise<void> {
    const now = Date.now();
    for (const [key, val] of this.otpStore.entries()) {
      if (val.expiresAt < now) this.otpStore.delete(key);
    }
  }

  async storePushToken(userId: string, token: string, platform: string, role?: string): Promise<void> {
    const existing = this.pushTokenStore.get(userId);
    this.pushTokenStore.set(userId, { token, platform, role: role !== undefined ? (role || "") : (existing?.role || "") });
  }

  async getPushToken(userId: string): Promise<{ token: string; platform: string; role?: string } | null> {
    return this.pushTokenStore.get(userId) || null;
  }

  async getAllPushTokens(): Promise<Array<{ userId: string; token: string; platform: string }>> {
    return Array.from(this.pushTokenStore.entries()).map(([userId, data]) => ({
      userId,
      token: data.token,
      platform: data.platform,
    }));
  }

  async getPushTokensByRole(role: string): Promise<Array<{ userId: string; token: string; platform: string }>> {
    return Array.from(this.pushTokenStore.entries())
      .filter(([, data]) => (data.role || "") === role)
      .map(([userId, data]) => ({ userId, token: data.token, platform: data.platform }));
  }

  async storeNotification(notif: { id: string; title: string; message: string; targetRole: string; targetUserId?: string }): Promise<void> {
    this.notificationStore.unshift({
      ...notif,
      read: false,
      sentAt: new Date().toISOString(),
    });
    if (this.notificationStore.length > 500) {
      this.notificationStore = this.notificationStore.slice(0, 500);
    }
  }

  async getNotifications(limit: number): Promise<any[]> {
    return this.notificationStore.slice(0, limit);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationStore.filter((n) => !n.read).length;
  }

  async markNotificationRead(notifId: string): Promise<void> {
    const notif = this.notificationStore.find((n) => n.id === notifId);
    if (notif) notif.read = true;
  }

  async deleteUserAccount(userId: string): Promise<boolean> {
    this.users.delete(userId);
    this.pushTokenStore.delete(userId);
    this.notificationStore = this.notificationStore.filter(n => n.targetUserId !== userId);
    return true;
  }
}

function createStorage(): IStorage {
  if (process.env.DATABASE_URL) {
    console.log("Using DatabaseStorage (PostgreSQL)");
    return new DatabaseStorage();
  }
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    throw new Error("DATABASE_URL is required in production. Cannot use in-memory storage.");
  }
  console.log("Using MemStorage (in-memory fallback — development only)");
  return new MemStorage();
}

export const storage = createStorage();
