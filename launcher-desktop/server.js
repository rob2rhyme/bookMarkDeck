// launcher.js
const express = require("express");
const { execFile } = require("child_process");
const os = require("os");

const DEFAULT_PORT = 47831;

function startServer({ port = DEFAULT_PORT } = {}) {
  const app = express();
  const TOKEN = process.env.BOOKMARKDECK_LAUNCHER_TOKEN || "";

  const ALLOWLIST = new Set([
    "http://localhost:3000",
    // add your production origin later
  ]);

  app.use(express.json());

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWLIST.has(origin)) {
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
    next();
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

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

  const server = app.listen(port, "127.0.0.1", () => {
    console.log(`Launcher listening on http://127.0.0.1:${port}`);
  });

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
