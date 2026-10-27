/**
 * ローカル確認用の簡易HTTPサーバー(Node 標準モジュールのみ)。
 * 使い方: node scripts/serve.js  → http://127.0.0.1:8080/
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIRECTORY = path.resolve(__dirname, "..");
const DEFAULT_PORT = 8080;
const HOST = "127.0.0.1";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
});

/**
 * URL のパスを、配信ルート内のファイルパスに変換する。ルート外を指す場合は null。
 * @param {string} rootDirectory
 * @param {string} requestUrl
 * @returns {string | null}
 */
function resolveRequestPath(rootDirectory, requestUrl) {
  const { pathname } = new URL(requestUrl, "http://localhost");
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const filePath = path.resolve(rootDirectory, relativePath);
  const isInsideRoot = filePath === rootDirectory || filePath.startsWith(`${rootDirectory}${path.sep}`);
  return isInsideRoot ? filePath : null;
}

function _sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function _handleRequest(rootDirectory, request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    _sendText(response, HTTP_METHOD_NOT_ALLOWED, "Method Not Allowed");
    return;
  }
  const filePath = resolveRequestPath(rootDirectory, request.url);
  if (!filePath) {
    _sendText(response, HTTP_FORBIDDEN, "Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      _sendText(response, HTTP_NOT_FOUND, "Not Found");
      return;
    }
    const contentType = CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream";
    response.writeHead(HTTP_OK, { "Content-Type": contentType, "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : content);
  });
}

/**
 * サーバーを起動する。port に 0 を渡すと空いているポートを使う。
 * @param {{port?: number, rootDirectory?: string}} [options]
 * @returns {Promise<{server: http.Server, url: string}>}
 */
function startServer(options = {}) {
  const rootDirectory = options.rootDirectory || ROOT_DIRECTORY;
  const port = options.port === undefined ? DEFAULT_PORT : options.port;
  const server = http.createServer((request, response) => {
    _handleRequest(rootDirectory, request, response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      resolve({ server, url: `http://${HOST}:${server.address().port}/` });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  startServer({ port }).then(({ url }) => {
    console.log(`配信中: ${url} (Ctrl+C で終了)`);
  });
}

module.exports = { startServer, resolveRequestPath };
