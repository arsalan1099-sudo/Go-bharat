const http = require("node:http");

const port = parseInt(process.env.PORT || "5000", 10);

const startupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Go Bharat</title>
  <style>
    body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#fff;font-family:sans-serif}
    .logo{font-size:28px;font-weight:700;color:#FF6B00;margin-bottom:12px}
    .sub{font-size:14px;color:#888}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF6B00;margin:0 3px;animation:bounce 1.2s infinite}
    .dot:nth-child(2){animation-delay:.2s}
    .dot:nth-child(3){animation-delay:.4s}
    @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}}
  </style>
</head>
<body>
  <div class="logo">Go Bharat</div>
  <div class="sub">Starting up<span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
  <script>setTimeout(function(){location.reload()},2000);</script>
</body>
</html>`;

const noCacheHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

const startupHandler = (req, res) => {
  if (req.url === "/" || req.url === "/api/health") {
    res.writeHead(200, noCacheHeaders);
    res.end(startupHtml);
  } else {
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    res.end(JSON.stringify({ error: "Server is starting up, please retry shortly" }));
  }
};

const server = http.createServer(startupHandler);

server.listen({ port, host: "0.0.0.0" }, () => {
  console.log(`express server listening on port ${port}`);

  globalThis.__GO_BHARAT_SERVER = server;
  globalThis.__GO_BHARAT_STARTUP_HANDLER = startupHandler;

  setTimeout(() => {
    import("./index.js").catch((err) => {
      console.error("FATAL: Failed to load application:", err);
      server.removeListener("request", startupHandler);
      server.on("request", (req, res) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Application failed to start" }));
      });
      setTimeout(() => process.exit(1), 5000);
    });
  }, 100);
});
