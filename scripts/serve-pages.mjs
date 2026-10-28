// Local preview of the GitHub Pages site: serves ./out under the same base path and
// with the same rules (directory → index.html, unknown path → 404.html).
// Usage: npm run preview:pages   →   http://localhost:4000/Project-Pilot/
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const BASE = process.env.PAGES_BASE_PATH ?? "/Project-Pilot";
const PORT = Number(process.env.PORT ?? 4000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".json": "application/json", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(302, { location: `${BASE}/` }).end();
    return;
  }
  let file = normalize(join("out", decodeURIComponent(url.pathname.slice(BASE.length))));
  if (!file.startsWith("out")) return res.writeHead(400).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  const found = existsSync(file);
  const path = found ? file : join("out", "404.html");
  res.writeHead(found ? 200 : 404, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
}).listen(PORT, () => console.log(`GitHub Pages preview: http://localhost:${PORT}${BASE}/`));
