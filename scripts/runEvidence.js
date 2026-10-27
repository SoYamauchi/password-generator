/**
 * 全テストを実行し、エビデンスを evidence/ に保存する。
 * 使い方: npm run test:evidence
 *   公開ページのテストも行うときは BASE_URL と PUBLISHED_REPOSITORY を指定する。
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const { REPOSITORY_ROOT, formatJst, runCommand, runNodeTests, writeLog } = require("./evidence/testRunner.js");
const { parseJunitFile } = require("./evidence/junit.js");
const { runMutations } = require("./evidence/mutations.js");
const { buildReport, readPublishSummary } = require("./evidence/report.js");
const { sanitizeText } = require("./evidence/sanitize.js");

const EVIDENCE_DIRECTORY = path.join(REPOSITORY_ROOT, "evidence");
// 公開スクリプトが作るファイルは、テストの再実行で消さない
const PRESERVED_FILES = Object.freeze(["publish-log.txt", "deployed-hash-check.txt", "publish-summary.json"]);
const LAYERS = Object.freeze([
  { name: "unit", title: "単体テスト", files: ["tests/unit/**/*.test.js"] },
  { name: "integration", title: "結合テスト", files: ["tests/integration/**/*.test.js"] },
  { name: "security", title: "セキュリティ確認", files: ["tests/security/**/*.test.js"] },
  { name: "e2e", title: "ブラウザテスト", files: ["tests/e2e/app.test.js"], env: { BASE_URL: "" } },
  { name: "published-e2e", title: "公開ページのテスト", files: ["tests/e2e/published.test.js"] },
]);

function _prepareEvidenceDirectory() {
  fs.mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });
  for (const entry of fs.readdirSync(EVIDENCE_DIRECTORY)) {
    if (!PRESERVED_FILES.includes(entry)) {
      fs.rmSync(path.join(EVIDENCE_DIRECTORY, entry), { recursive: true, force: true });
    }
  }
  fs.mkdirSync(path.join(EVIDENCE_DIRECTORY, "screenshots"), { recursive: true });
}

async function _getBrowserVersions() {
  const versions = [];
  for (const browserType of [chromium, webkit]) {
    try {
      const browser = await browserType.launch();
      versions.push(`${browserType.name()} ${browser.version()}`);
      await browser.close();
    } catch (error) {
      versions.push(`${browserType.name()} 起動できない(${error.message.split("\n")[0]})`);
    }
  }
  return versions;
}

// NOTE: Windows で npm.cmd を shell 経由で呼ばずに済むよう、Node から npm-cli.js を直接実行する
function _runNpm(args) {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter((candidate) => candidate && candidate.endsWith(".js") && fs.existsSync(candidate));
  if (candidates.length === 0) {
    return { output: "npm が見つからない", exitCode: 1 };
  }
  return runCommand(process.execPath, [candidates[0], ...args]);
}

async function _writeEnvironment(startedAt) {
  const browsers = await _getBrowserVersions();
  const npmList = _runNpm(["ls", "--depth=0"]);
  const gitHead = runCommand("git", ["rev-parse", "HEAD"]);
  const lines = [
    `実行日時: ${formatJst(startedAt)}`,
    `OS: ${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
    `node -v: ${process.version}`,
    `npm -v: ${_runNpm(["-v"]).output.trim()}`,
    "npm ls --depth=0:",
    npmList.output.trimEnd(),
    `ブラウザ(Playwright): ${browsers.join(" / ")}`,
    `git rev-parse HEAD: ${gitHead.exitCode === 0 ? gitHead.output.trim() : "取得できない"}`,
    "",
  ];
  fs.writeFileSync(path.join(EVIDENCE_DIRECTORY, "environment.txt"), sanitizeText(lines.join("\n")));
  return `${os.type()} ${os.release()}、Node ${process.version}、${browsers.join("・")}`;
}

function _runEslint() {
  const startedAt = new Date();
  const eslintBin = path.join(REPOSITORY_ROOT, "node_modules", "eslint", "bin", "eslint.js");
  const { output, exitCode } = runCommand(process.execPath, [eslintBin, ".", "--max-warnings", "0"]);
  const body = output.trim() === "" ? "(出力なし: 警告0件・エラー0件)" : output;
  writeLog(path.join(EVIDENCE_DIRECTORY, "eslint.log"), {
    title: "ESLint", commandLine: "npx eslint . --max-warnings 0", output: body, exitCode, startedAt,
  });
  return exitCode;
}

function _runLayer(layer) {
  const startedAt = new Date();
  const logFile = `evidence/${layer.name}.log`;
  const junitPath = path.join(EVIDENCE_DIRECTORY, `junit-${layer.name}.xml`);
  const env = { EVIDENCE_DIR: EVIDENCE_DIRECTORY, ...layer.env };
  const run = runNodeTests({ files: layer.files, junitPath, env });
  writeLog(path.join(REPOSITORY_ROOT, logFile), { title: layer.title, ...run, startedAt });
  const logText = fs.readFileSync(path.join(REPOSITORY_ROOT, logFile), "utf8");
  console.log(`  ${layer.title}: 終了コード ${run.exitCode}`);
  return { ...layer, logFile, logText, exitCode: run.exitCode, results: parseJunitFile(junitPath) };
}

function _runCoverage() {
  const startedAt = new Date();
  const args = [
    "--test", "--test-concurrency=1", "--experimental-test-coverage",
    "--test-coverage-include=passwordGenerator.js", "tests/unit/**/*.test.js", "tests/integration/**/*.test.js",
  ];
  const { output, exitCode } = runCommand(process.execPath, args);
  const match = output.match(/passwordGenerator\.js\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);
  const summary = match
    ? `passwordGenerator.js の行カバレッジ ${match[1]}%、分岐 ${match[2]}%、関数 ${match[3]}%`
    : "カバレッジの数値を取得できなかった";
  writeLog(path.join(EVIDENCE_DIRECTORY, "coverage.txt"), {
    title: `カバレッジ(${summary})`, commandLine: `node ${args.join(" ")}`, output, exitCode, startedAt,
  });
  return summary;
}

function _writeStatistics(layers) {
  const lines = ["# 統計値(各ログの [STAT] 行を集めたもの)", ""];
  for (const layer of layers) {
    const statLines = layer.logText.split("\n").filter((line) => line.includes("[STAT]"));
    if (statLines.length > 0) {
      lines.push(`## ${layer.logFile}`, ...statLines.map((line) => line.trim()), "");
    }
  }
  fs.writeFileSync(path.join(EVIDENCE_DIRECTORY, "statistics.log"), sanitizeText(lines.join("\n")));
}

function _buildExtraSections(eslintExitCode, coverageSummary) {
  return [
    "## 静的解析とカバレッジ",
    "",
    `- ESLint: 終了コード ${eslintExitCode}(${eslintExitCode === 0 ? "警告・エラー0件" : "警告またはエラーあり"})`
      + "(evidence/eslint.log)",
    `- カバレッジ: ${coverageSummary}(evidence/coverage.txt)`,
    "- 統計値: evidence/statistics.log、リクエスト一覧: evidence/network-requests.json",
    "- スクリーンショット: evidence/screenshots/(写っているパスワードはテスト用の使い捨ての値)",
    "",
  ];
}

async function main() {
  const startedAt = new Date();
  _prepareEvidenceDirectory();
  console.log("環境を記録しています");
  const environmentSummary = await _writeEnvironment(startedAt);
  console.log("ESLint を実行しています");
  const eslintExitCode = _runEslint();
  console.log("不良版(ミューテーション)を確認しています");
  const mutations = runMutations(EVIDENCE_DIRECTORY);
  console.log("元のコードで全テストを実行しています");
  const layers = LAYERS.map(_runLayer);
  console.log("カバレッジを計測しています");
  const coverageSummary = _runCoverage();
  _writeStatistics(layers);
  const { text, summary } = buildReport({
    layers, mutations, environmentSummary, generatedAt: formatJst(startedAt),
    checkedDate: formatJst(startedAt).slice(0, "YYYY-MM-DD".length),
    extraSections: _buildExtraSections(eslintExitCode, coverageSummary),
    publishSummary: readPublishSummary(EVIDENCE_DIRECTORY),
  });
  fs.writeFileSync(path.join(EVIDENCE_DIRECTORY, "test-report.md"), sanitizeText(text));
  const isAllGood = summary.testCounts.fail === 0 && eslintExitCode === 0
    && mutations.every((mutation) => mutation.isDetected && mutation.isRestored);
  console.log(`テストケース: 合格 ${summary.testCounts.pass}・不合格 ${summary.testCounts.fail}・未実施 ${summary.testCounts.skipped}`);
  console.log(`テスト観点: 合 ${summary.rowCounts.合}・否 ${summary.rowCounts.否}・未実施 ${summary.rowCounts.未実施}`);
  console.log(`不良版の検出: ${mutations.filter((mutation) => mutation.isDetected).length}/${mutations.length}`);
  process.exitCode = isAllGood ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
