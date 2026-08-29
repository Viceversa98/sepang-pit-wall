/**
 * Serve dist/ with COOP/COEP so SharedArrayBuffer works (vite preview does this too).
 * Usage: node scripts/serve-dist.mjs [port]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../dist");
const port = Number(process.argv[2]) || 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

const resolvePath = async (urlPath) => {
  const safe = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(root, safe);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(root, "index.html");
  }
  return filePath;
};

createServer(async (req, res) => {
  try {
    const filePath = await resolvePath(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      ...isolationHeaders,
    });
    res.end(body);
  } catch {
    res.writeHead(404, isolationHeaders);
    res.end("Not found");
  }
}).listen(port, () => {
  console.log(`dist/ → http://localhost:${port} (COOP/COEP enabled)`);
});
