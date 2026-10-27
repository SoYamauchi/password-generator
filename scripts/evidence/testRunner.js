"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { sanitizeText } = require("./sanitize.js");

const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const TIME_ZONE = "Asia/Tokyo";

/**
 * 日本時間の日時を "YYYY-MM-DD HH:mm:ss JST" の形で返す。
 * @param {Date} [date]
 * @returns {string}
 */
function formatJst(date = new Date()) {
  const text = date.toLocaleString("sv-SE", { timeZone: TIME_ZONE, hour12: false });
  return `${text} JST`;
}

/**
 * コマンドを実行し、標準出力と標準エラーをまとめて返す。
 * @param {string} command
 * @param {string[]} args
 * @param {{env?: object, cwd?: string, shell?: boolean}} [options]
 * @returns {{output: string, exitCode: number}}
 */
function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT_BYTES,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", ...options.env },
    shell: Boolean(options.shell),
  });
  const output = `${result.stdout || ""}${result.stderr || ""}${result.error ? String(result.error) : ""}`;
  return { output, exitCode: result.status === null ? 1 : result.status };
}

/**
 * node:test を spec 形式(画面用)と JUnit 形式(集計用)の両方で実行する。
 * @param {{files: string[], junitPath: string, env?: object}} options
 * @returns {{output: string, exitCode: number, commandLine: string}}
 */
function runNodeTests(options) {
  const args = [
    "--test",
    "--test-concurrency=1",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=junit",
    `--test-reporter-destination=${options.junitPath}`,
    ...options.files,
  ];
  const { output, exitCode } = runCommand(process.execPath, args, { env: options.env });
  if (fs.existsSync(options.junitPath)) {
    fs.writeFileSync(options.junitPath, sanitizeText(fs.readFileSync(options.junitPath, "utf8")));
  }
  const commandLine = `node ${args.join(" ")}`.split(`${REPOSITORY_ROOT}${path.sep}`).join("");
  return { output, exitCode, commandLine };
}

/**
 * ログファイルを書く。先頭に実行日時とコマンド、末尾に終了コードを付け、個人の値を伏せる。
 */
function writeLog(filePath, { title, commandLine, output, exitCode, startedAt }) {
  const lines = [
    `# ${title}`,
    `# 実行日時: ${formatJst(startedAt)}`,
    commandLine ? `# コマンド: ${commandLine}` : null,
    "",
    output.trimEnd(),
    "",
    `終了コード: ${exitCode}`,
    "",
  ].filter((line) => line !== null);
  fs.writeFileSync(filePath, sanitizeText(lines.join("\n")));
}

module.exports = { REPOSITORY_ROOT, formatJst, runCommand, runNodeTests, writeLog };
