import express from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { createServer, type Server } from "node:http";
import { registerRoutes } from "./routes";
import { pool, getPoolHealth } from "./db";
import { cache } from "./cache";
import * as fs from "fs";
import * as path from "path";

const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const bootstrapServer = (globalThis as any).__GO_BHARAT_SERVER as Server | undefined;
const bootstrapStartupHandler = (globalThis as any).__GO_BHARAT_STARTUP_HANDLER as Function | undefined;

const app = express();
let server: Server;

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "20mb" }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}


function configureExpoAndLanding(app: express.Application) {
  const adminPath = path.resolve(process.cwd(), "server", "templates", "admin.html");
  const adminTemplate = fs.readFileSync(adminPath, "utf-8");

  log("Serving Go Bharat Expo app at /");

  app.get('/admin', (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(adminTemplate);
  });

  // Valid robots.txt — allows all crawlers, points to sitemap
  app.get('/robots.txt', (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(
      "User-agent: *\nAllow: /\nSitemap: https://gobharat.in/sitemap.xml\n"
    );
  });

  // Serve the Expo static build's index.html for all non-API, non-asset routes
  const serveExpoApp = (res: Response) => {
    const indexPath = path.resolve(process.cwd(), "static-build", "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      return res.sendFile(indexPath);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Go Bharat</title></head><body><p>Loading Go Bharat...</p></body></html>`);
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();

    // Expo Go manifest requests
    const platform = req.header("expo-platform");
    if ((req.path === "/" || req.path === "/manifest") && platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  // SPA fallback: serve Expo app for all non-API routes (client-side routing)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    serveExpoApp(res);
  });

  log("Expo app: / | Admin panel: /admin");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  app.set("trust proxy", 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(compression());

  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts, please try again later" },
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many AI requests, please try again later" },
  });

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many write requests, please try again later" },
  });

  const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
    skip: (req) =>
      !req.path.startsWith("/api") ||
      req.path.startsWith("/api/otp") ||
      req.path.startsWith("/api/auth"),
  });

  app.use("/api/otp", authLimiter);
  app.use("/api/auth", authLimiter);
  app.use("/api/ai", aiLimiter);
  app.use("/api/payments", writeLimiter);
  app.use(readLimiter);

  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  app.get('/map', (_req, res) => {
    const mapPath = path.resolve(process.cwd(), 'server', 'templates', 'map.html');
    res.sendFile(mapPath);
  });

  app.get('/api/health', async (_req, res) => {
    try {
      const poolHealth = await getPoolHealth();
      res.json({
        status: "healthy",
        uptime: process.uptime(),
        database: poolHealth,
        cache: cache.stats(),
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
      });
    } catch (err) {
      res.status(500).json({ status: "unhealthy", error: String(err) });
    }
  });

  if (bootstrapServer) {
    server = bootstrapServer;
  } else {
    server = createServer(app);
    const port = parseInt(process.env.PORT || "5000", 10);
    const host = process.env.HOST || "0.0.0.0";

    const startListening = () => {
      server.listen({ port, host }, () => {
        log(`express server listening on ${host}:${port}`);
      });
    };

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        log(`Port ${port} is in use — killing stale process and retrying…`);
        import("child_process").then(({ exec }) => {
          exec(`fuser -k ${port}/tcp 2>/dev/null; sleep 1`, () => {
            setTimeout(() => {
              server.removeAllListeners("error");
              server.on("error", (e: NodeJS.ErrnoException) => {
                console.error("Server error after retry:", e);
                process.exit(1);
              });
              startListening();
            }, 1000);
          });
        });
      } else {
        throw err;
      }
    });

    // Proactively evict any stale process before binding, then start
    import("child_process").then(({ exec }) => {
      exec(`fuser -k ${port}/tcp 2>/dev/null; true`, () => {
        setTimeout(startListening, 500);
      });
    });
  }

  registerRoutes(app).then(() => {
    setupErrorHandler(app);
    if (bootstrapServer && bootstrapStartupHandler) {
      server.removeListener("request", bootstrapStartupHandler as any);
      server.on("request", app);
      log("Server switched to full application handler");
    }
    log("All routes registered — server fully ready");
  }).catch((err) => {
    console.error("Failed to register routes:", err);
    setupErrorHandler(app);
    if (bootstrapServer && bootstrapStartupHandler) {
      server.removeListener("request", bootstrapStartupHandler as any);
      server.on("request", app);
    }
  });

  const gracefulShutdown = (signal: string) => {
    log(`Received ${signal}. Shutting down gracefully...`);
    // Force-close all keep-alive connections so the port releases immediately
    if (typeof (server as any).closeAllConnections === "function") {
      (server as any).closeAllConnections();
    }
    server.close(async () => {
      log("HTTP server closed");
      try {
        await pool.end();
        log("Database pool closed");
      } catch (err) {
        console.error("Error closing database pool:", err);
      }
      process.exit(0);
    });
    setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 3_000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
