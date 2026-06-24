// launcher.js
const express = require("express");
const { execFile } = require("child_process");
const fs = require("fs");
const https = require("https");
const os = require("os");

const DEFAULT_PORT = 47831;
const LOCAL_DEV_ORIGIN = "http://localhost:3000";
const PROD_ORIGIN = "https://bmarkdeck.rob2rhyme.app";

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === LOCAL_DEV_ORIGIN) return true;
  if (origin === PROD_ORIGIN) return true;
  return origin.startsWith("https://") && origin.endsWith(".vercel.app");
}

function startServer({ port = DEFAULT_PORT, https: httpsConfig } = {}) {
  const app = express();
  const TOKEN = process.env.BOOKMARKDECK_LAUNCHER_TOKEN || "";

  app.use(express.json());

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = isAllowedOrigin(origin);

    if (origin && allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,X-BookmarkDeck-Token"
    );

    if (req.headers["access-control-request-private-network"] === "true") {
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    // Optional hardening: reject disallowed cross-origin traffic except /health.
    if (origin && !allowed && req.path !== "/health") {
      return res.status(403).send("Origin not allowed");
    }

    next();
  });

  app.get("/", (_req, res) =>
    res.json({ ok: true, service: "BookmarkDeck Launcher" })
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/apps", (req, res) => {
    const token = req.get("X-BookmarkDeck-Token");
    if (!TOKEN || token !== TOKEN) {
      return res.status(401).send("Invalid token");
    }

    const platform = os.platform();

    if (platform === "darwin") {
      const script = [
        'for dir in /Applications /Applications/Utilities "$HOME/Applications" /System/Applications; do',
        '  [ -d "$dir" ] || continue;',
        '  for app in "$dir"/*.app; do',
        '    [ -e "$app" ] || continue;',
        '    bid=$(mdls -name kMDItemCFBundleIdentifier -raw "$app" 2>/dev/null);',
        '    name=$(basename "$app" .app);',
        `    printf '%s\\t%s\\t%s\\n' "$name" "$bid" "$app";`,
        "  done;",
        "done",
      ].join("\n");

      return execFile(
        "/bin/bash",
        ["-c", script],
        { maxBuffer: 4 * 1024 * 1024 },
        (err, stdout) => {
          if (err) return res.status(500).send(err.message);
          const seen = new Set();
          const apps = [];
          for (const line of String(stdout).split("\n")) {
            const [name, bundleId, localPath] = line.split("\t");
            if (!name || !localPath || seen.has(localPath)) continue;
            seen.add(localPath);
            apps.push({
              name,
              bundleId: bundleId && bundleId !== "(null)" ? bundleId : undefined,
              localPath,
            });
          }
          apps.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          );
          res.json({ platform, apps });
        }
      );
    }

    if (platform === "win32") {
      const ps =
        "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress";
      return execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", ps],
        { maxBuffer: 4 * 1024 * 1024 },
        (err, stdout) => {
          if (err) return res.status(500).send(err.message);
          let parsed = [];
          try {
            parsed = JSON.parse(String(stdout).trim() || "[]");
          } catch {
            parsed = [];
          }
          const list = Array.isArray(parsed) ? parsed : [parsed];
          const apps = list
            .filter((item) => item && item.Name && item.AppID)
            .map((item) => ({ name: item.Name, appUserModelId: item.AppID }))
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
            );
          res.json({ platform, apps });
        }
      );
    }

    return res.json({ platform, apps: [] });
  });

  app.post("/open", (req, res) => {
    const token = req.get("X-BookmarkDeck-Token");
    if (!TOKEN || token !== TOKEN) {
      return res.status(401).send("Invalid token");
    }

    const { localPath, bundleId, appUserModelId } = req.body || {};
    const platform = os.platform();

    const done = (err) => {
      if (err) return res.status(500).send(err.message);
      res.json({ ok: true });
    };

    if (platform === "darwin") {
      if (bundleId) return execFile("open", ["-b", bundleId], done);
      if (localPath) return execFile("open", ["-a", localPath], done);
      return res.status(400).send("Missing target");
    }

    if (platform === "win32") {
      if (appUserModelId) {
        return execFile(
          "cmd.exe",
          ["/c", "start", "", `shell:AppsFolder\\${appUserModelId}`],
          done
        );
      }
      if (localPath) {
        return execFile("cmd.exe", ["/c", "start", "", localPath], done);
      }
      return res.status(400).send("Missing target");
    }

    return res.status(400).send("Unsupported platform");
  });

  let server;

  if (httpsConfig && httpsConfig.keyPath && httpsConfig.certPath) {
    const key = fs.readFileSync(httpsConfig.keyPath);
    const cert = fs.readFileSync(httpsConfig.certPath);
    server = https.createServer({ key, cert }, app);
    server.listen(port, "127.0.0.1", () => {
      console.log(`Launcher listening on https://127.0.0.1:${port}`);
    });
  } else {
    server = app.listen(port, "127.0.0.1", () => {
      console.log(`Launcher listening on http://127.0.0.1:${port}`);
    });
  }

  const stop = () =>
    new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

  return { server, stop };
}

module.exports = { startServer };
