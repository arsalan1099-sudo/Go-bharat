import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const IS_PRODUCTION = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && IS_PRODUCTION) {
  throw new Error("JWT_SECRET environment variable is required in production");
}
const SECRET = JWT_SECRET || "dev-only-secret-" + Math.random().toString(36);
const JWT_EXPIRY = "7d";

export interface AuthPayload {
  phone: string;
  role?: string;
  id?: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function generateToken(phone: string, role?: string, id?: string): string {
  return jwt.sign({ phone, role, id }, SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

// Short-lived token carrying a server-verified Google identity through the
// phone-linking step. The client cannot forge the Google identity because the
// token is signed with our JWT secret and re-verified on the link endpoint.
const GOOGLE_LINK_EXPIRY = "10m";

export interface GoogleLinkData {
  googleSub: string;
  email: string;
  name: string;
}

export function generateGoogleLinkToken(data: GoogleLinkData): string {
  return jwt.sign({ ...data, purpose: "google-link" }, SECRET, { expiresIn: GOOGLE_LINK_EXPIRY });
}

export function verifyGoogleLinkToken(token: string): GoogleLinkData | null {
  try {
    const payload = jwt.verify(token, SECRET) as any;
    if (payload.purpose !== "google-link" || !payload.googleSub || !payload.email) return null;
    return { googleSub: payload.googleSub, email: payload.email, name: payload.name || "" };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = payload;
  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userRole = req.user.role || "";
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}
