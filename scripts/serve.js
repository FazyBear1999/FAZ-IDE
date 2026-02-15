const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  if (res.writableEnded || res.destroyed) return;
  if (!res.headersSent) {
    res.writeHead(status, { "Content-Type": type });
  }
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/") pathname = "/index.html";

    const filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) {
      send(res, 403, "Forbidden");
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        send(res, 404, "Not Found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const type = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      const stream = fs.createReadStream(filePath);
      req.on("aborted", () => stream.destroy());
      res.on("close", () => stream.destroy());
      stream.on("error", () => {
        if (res.writableEnded || res.destroyed) return;
        if (!res.headersSent) {
          send(res, 500, "Server Error");
          return;
        }
        res.end();
      });
      stream.pipe(res);
    });
  } catch (err) {
    send(res, 500, "Server Error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FAZ IDE server running on http://127.0.0.1:${port}`);
});
