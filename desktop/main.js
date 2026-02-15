"use strict";

const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

const HOST = "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm"
};

let localServer = null;
let localPort = null;

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-cache, no-store, must-revalidate"
  });
  res.end(body);
}

function resolveWebRoot() {
  const candidates = [
    path.join(app.getAppPath(), "dist_site"),
    path.join(__dirname, "..", "dist_site")
  ];

  for (const root of candidates) {
    if (fs.existsSync(path.join(root, "index.html"))) return root;
  }

  throw new Error("Unable to locate dist_site/index.html. Build or copy dist_site before launching desktop mode.");
}

function createStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url || "/", `http://${HOST}`);
        let pathname = decodeURIComponent(requestUrl.pathname || "/");
        if (pathname === "/") pathname = "/index.html";

        const relativePath = pathname.replace(/^\/+/, "");
        const absolutePath = path.resolve(rootDir, relativePath);
        const rel = path.relative(rootDir, absolutePath);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          send(res, 403, "Forbidden");
          return;
        }

        fs.stat(absolutePath, (err, stat) => {
          if (err || !stat.isFile()) {
            send(res, 404, "Not Found");
            return;
          }

          const ext = path.extname(absolutePath).toLowerCase();
          const type = MIME_TYPES[ext] || "application/octet-stream";
          res.writeHead(200, { "Content-Type": type });

          const stream = fs.createReadStream(absolutePath);
          stream.on("error", () => send(res, 500, "Server Error"));
          stream.pipe(res);
        });
      } catch (err) {
        send(res, 500, "Server Error");
      }
    });

    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      if (!port) {
        reject(new Error("Could not resolve local server port."));
        return;
      }

      server.removeListener("error", reject);
      resolve({ server, port });
    });
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    autoHideMenuBar: true,
    backgroundColor: "#0b0f14",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.loadURL(`http://${HOST}:${localPort}/index.html`);
}

function stopServer() {
  if (!localServer) return;
  try {
    localServer.close();
  } catch (err) {
    // Ignore shutdown errors while quitting.
  }
  localServer = null;
  localPort = null;
}

async function launch() {
  const webRoot = resolveWebRoot();
  const started = await createStaticServer(webRoot);
  localServer = started.server;
  localPort = started.port;
  createMainWindow();
}

app.whenReady()
  .then(launch)
  .catch((err) => {
    const message = err && err.message ? err.message : String(err);
    console.error("FAZ IDE desktop boot failed:", message);
    dialog.showErrorBox("FAZ IDE", `Desktop launch failed.\n\n${message}`);
    app.quit();
  });

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && localPort) {
    createMainWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  stopServer();
});
