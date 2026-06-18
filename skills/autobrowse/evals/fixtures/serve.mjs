#!/usr/bin/env node
// Tiny static server for the Tier A deterministic fixture sites.
// Usage: node fixtures/serve.mjs [port]   (default 4173)

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2] || "4173", 10);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.error(`fixtures on http://localhost:${PORT}/ (checkout/, flightdeck/)`));
