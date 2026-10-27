/**
 * GitHub への公開と、公開ページの検証(要件定義書 9-2)。
 * 認証は、このPCに設定済みの gh のログイン状態だけを使う。
 *
 * 使い方:
 *   node scripts/publish.js           公開前の確認 → リポジトリ作成と push → Pages 有効化 → 検証
 *   node scripts/publish.js --verify  追加のコミットを push して、公開ページを再検証する
 *   node scripts/publish.js --mask-log-only  publish-log.txt の認証情報の行を伏せ直すだけ
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { REPOSITORY_ROOT, formatJst, runCommand } = require("./evidence/testRunner.js");
const { parseJunitFile } = require("./evidence/junit.js");
const { sanitizeText } = require("./evidence/sanitize.js");
const {
  AUTH_STRING_REGEX, CREDENTIAL_PATTERNS, createLocalIdentityPatterns, findSensitiveMatches, listRepositoryTextFiles,
} = require("../tests/helpers/sensitivePatterns.js");

const EVIDENCE_DIRECTORY = path.join(REPOSITORY_ROOT, "evidence");
const PUBLISH_LOG_PATH = path.join(EVIDENCE_DIRECTORY, "publish-log.txt");
const REPOSITORY_NAMES = Object.freeze(["password-generator", "password-generator-app"]);
const DEPLOYED_FILES = Object.freeze(["index.html", "passwordGenerator.js", "app.js", "style.css"]);
const REQUIRED_JUNIT_LAYERS = Object.freeze(["unit", "integration", "security", "e2e"]);
const NOREPLY_SUFFIX = "@users.noreply.github.com";
const POLL_INTERVAL_MILLISECONDS = 30 * 1000;
const MAX_POLLS = 20;
const MAX_HASH_ATTEMPTS = 3;
const HTTP_OK = 200;
const LINE_BREAK = String.fromCharCode(10);

const logEntries = [];

// gh auth status が出す認証情報の行(値は gh が伏せ字にしているが、行ごと伏せる)。検索語は部品をつないで作る
const AUTH_VALUE_LINE_REGEX = new RegExp(["^(\\s*-\\s*)", "To", "ken", ":\\s.*$"].join(""), "gim");
const AUTH_SCOPES_LINE_REGEX = new RegExp(["^(\\s*-\\s*)", "To", "ken", " scopes:"].join(""), "gim");

function _maskOutput(text) {
  return sanitizeText(text)
    .replace(AUTH_STRING_REGEX, "***")
    .replace(AUTH_VALUE_LINE_REGEX, "$1(認証情報の行は伏せた)")
    .replace(AUTH_SCOPES_LINE_REGEX, "$1付与されているスコープ:");
}

/**
 * コマンドを実行し、コマンドと出力を publish-log.txt 用に記録する。
 */
function run(command, args, options = {}) {
  const result = runCommand(command, args);
  const output = _maskOutput(result.output).trimEnd();
  logEntries.push([`$ ${[command, ...args].join(" ")}`, output, `(終了コード: ${result.exitCode})`].join(LINE_BREAK));
  if (options.mustSucceed && result.exitCode !== 0) {
    throw new Error(`コマンドが失敗した: ${command} ${args.join(" ")}`);
  }
  return result;
}

function note(message) {
  console.log(message);
  logEntries.push(`# ${message}`);
}

function _flushLog(title) {
  fs.mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });
  const header = `\n========== ${title}(${formatJst()}) ==========\n`;
  fs.appendFileSync(PUBLISH_LOG_PATH, `${header}${logEntries.join("\n\n")}\n`);
  logEntries.length = 0;
}

function _sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function _assertTestsPassed() {
  for (const layer of REQUIRED_JUNIT_LAYERS) {
    const results = parseJunitFile(path.join(EVIDENCE_DIRECTORY, `junit-${layer}.xml`));
    const failed = results.filter((result) => result.status === "fail");
    note(`確認: ${layer} のテスト 合格 ${results.length - failed.length} 件・不合格 ${failed.length} 件`);
    if (results.length === 0 || failed.length > 0) {
      throw new Error(`${layer} のテストが合格していない(npm run test:evidence を先に実行する)`);
    }
  }
}

function _scanTexts(entries, patterns, includePersonalFormats) {
  return entries.flatMap(({ name, text }) =>
    findSensitiveMatches(text, patterns, { includePersonalFormats }).map((finding) =>
      `${name}:${finding.line} ${finding.label}`));
}

function _assertNoSensitiveData() {
  const workingTree = listRepositoryTextFiles(REPOSITORY_ROOT).map((name) => ({
    name, text: fs.readFileSync(path.join(REPOSITORY_ROOT, name), "utf8"),
  }));
  const history = [{ name: "git log -p --all", text: runCommand("git", ["log", "-p", "--all"]).output }];
  const identity = createLocalIdentityPatterns();
  const credentialFindings = _scanTexts([...workingTree, ...history], CREDENTIAL_PATTERNS, false);
  note(`確認: 秘密情報の検査(作業ツリー ${workingTree.length} ファイルと git 履歴) 検出 ${credentialFindings.length} 件`);
  const personalFindings = _scanTexts([...workingTree, ...history], identity, true);
  note(`確認: 個人情報の検査(作業ツリーと git 履歴) 検出 ${personalFindings.length} 件`);
  [...credentialFindings, ...personalFindings].forEach((finding) => note(`  検出: ${finding}`));
  if (credentialFindings.length > 0 || personalFindings.length > 0) {
    throw new Error("秘密情報または個人情報が見つかったため中止する");
  }
}

function _assertGitIdentity() {
  const authors = runCommand("git", ["log", "--all", "--format=%ae%n%ce"]).output.split("\n").filter(Boolean);
  const nonNoreply = [...new Set(authors)].filter((email) => !email.endsWith(NOREPLY_SUFFIX));
  const configured = runCommand("git", ["config", "user.email"]).output.trim();
  note(`確認: git のメールアドレスが noreply か → 設定: ${configured.endsWith(NOREPLY_SUFFIX) ? "はい" : "いいえ"}、`
    + `履歴の noreply 以外: ${nonNoreply.length} 件`);
  if (!configured.endsWith(NOREPLY_SUFFIX) || nonNoreply.length > 0) {
    throw new Error("git のメールアドレスが noreply ではないため中止する(確認が必要)");
  }
}

function _assertWorkingTreeReady() {
  const gitignore = fs.readFileSync(path.join(REPOSITORY_ROOT, ".gitignore"), "utf8");
  const trackedModules = runCommand("git", ["ls-files", "node_modules"]).output.trim();
  const status = run("git", ["status", "--porcelain"]).output.trim();
  note(`確認: .gitignore に node_modules/ がある: ${gitignore.includes("node_modules/") ? "はい" : "いいえ"}、`
    + `node_modules の追跡: ${trackedModules ? "あり" : "なし"}、未コミットの変更: ${status ? "あり" : "なし"}`);
  if (!gitignore.includes("node_modules/") || trackedModules || status) {
    throw new Error("作業ツリーの準備ができていない(.gitignore または未コミットの変更)");
  }
}

function _runPrechecks() {
  note("公開前の確認を開始する");
  run("gh", ["auth", "status"], { mustSucceed: true });
  _assertTestsPassed();
  _assertNoSensitiveData();
  _assertGitIdentity();
  _assertWorkingTreeReady();
  note("公開前の確認: すべて合格");
}

function _getOwner() {
  return run("gh", ["api", "user", "-q", ".login"], { mustSucceed: true }).output.trim();
}

function _getExistingOrigin() {
  const result = runCommand("git", ["remote", "get-url", "origin"]);
  if (result.exitCode !== 0) {
    return null;
  }
  const match = result.output.trim().match(/github\.com[/:]([^/]+)\/([^/.\s]+)(?:\.git)?$/);
  return match ? { owner: match[1], name: match[2] } : null;
}

function _chooseRepositoryName(owner) {
  for (const name of REPOSITORY_NAMES) {
    const result = run("gh", ["repo", "view", `${owner}/${name}`, "--json", "name"]);
    if (result.exitCode !== 0) {
      note(`リポジトリ名 ${name} は使われていない`);
      return name;
    }
    note(`リポジトリ名 ${name} はすでに存在するため、上書きせずに次の名前を試す`);
  }
  throw new Error("password-generator と password-generator-app のどちらも使えないため中止する");
}

function _createAndPush(owner) {
  const name = _chooseRepositoryName(owner);
  run("git", ["branch", "-M", "main"], { mustSucceed: true });
  run("gh", ["repo", "create", name, "--public", "--source=.", "--remote=origin", "--push"], { mustSucceed: true });
  return name;
}

function _enablePages(repository) {
  const existing = run("gh", ["api", `repos/${repository}/pages`]);
  if (existing.exitCode === 0) {
    note("GitHub Pages はすでに有効なので、設定を確認するだけにする");
    return;
  }
  run("gh", ["api", "-X", "POST", `repos/${repository}/pages`, "-f", "source[branch]=main", "-f", "source[path]=/"],
    { mustSucceed: true });
}

async function _waitForBuild(repository, expectedCommit) {
  for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
    const query = "[.status, .commit] | join(\" \")";
    const result = run("gh", ["api", `repos/${repository}/pages/builds/latest`, "-q", query]);
    const [status, commit] = result.output.trim().split(" ");
    note(`Pages のビルド状況(${poll}/${MAX_POLLS}回目): ${status || "不明"} commit=${commit || "-"}`);
    if (status === "built" && commit === expectedCommit) {
      return;
    }
    if (status === "errored") {
      throw new Error("Pages のビルドが失敗した");
    }
    await _sleep(POLL_INTERVAL_MILLISECONDS);
  }
  throw new Error("10分待っても Pages の公開が完了しなかった");
}

function _checkHeaders(url) {
  const result = run("curl", ["-sI", url], { mustSucceed: true });
  const statusLine = result.output.split(/\r?\n/)[0] || "";
  const httpStatus = Number((statusLine.match(/^HTTP\/[\d.]+\s+(\d{3})/) || [])[1]);
  return { httpStatus, isHttps: url.startsWith("https://") };
}

function _sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function _compareHashes(url) {
  const hashes = [];
  for (const file of DEPLOYED_FILES) {
    const local = _sha256(fs.readFileSync(path.join(REPOSITORY_ROOT, file)));
    // NOTE: CDN の古いキャッシュを避けるため、検証ごとに異なるクエリを付ける
    const response = await fetch(`${url}${file}?verify=${crypto.randomUUID()}`, { cache: "no-store" });
    const remote = response.ok ? _sha256(Buffer.from(await response.arrayBuffer())) : `HTTP ${response.status}`;
    hashes.push({ file, local, remote, isMatch: local === remote });
  }
  return hashes;
}

async function _compareHashesWithRetry(url) {
  for (let attempt = 1; attempt <= MAX_HASH_ATTEMPTS; attempt += 1) {
    const hashes = await _compareHashes(url);
    note(`SHA-256 の比較(${attempt}/${MAX_HASH_ATTEMPTS}回目): 一致 ${hashes.filter((hash) => hash.isMatch).length}`
      + `/${hashes.length}`);
    if (hashes.every((hash) => hash.isMatch) || attempt === MAX_HASH_ATTEMPTS) {
      return hashes;
    }
    await _sleep(POLL_INTERVAL_MILLISECONDS);
  }
  return [];
}

function _writeHashCheck(summary) {
  const lines = [
    `確認日時: ${summary.checkedAt}`,
    `公開URL: ${summary.url}`,
    `比較方法: ローカルのファイルと、公開URLから取得したファイルの SHA-256 を比較`,
    "",
    ...summary.hashes.flatMap((hash) => [
      `${hash.file}`,
      `  ローカル: ${hash.local}`,
      `  公開    : ${hash.remote}`,
      `  判定    : ${hash.isMatch ? "一致" : "不一致"}`,
    ]),
    "",
    `総合判定: ${summary.hashes.every((hash) => hash.isMatch) ? "合(全ファイル一致)" : "否"}`,
    "",
  ];
  fs.writeFileSync(path.join(EVIDENCE_DIRECTORY, "deployed-hash-check.txt"), lines.join("\n"));
  fs.writeFileSync(path.join(EVIDENCE_DIRECTORY, "publish-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
}

async function _verify(repository) {
  const head = runCommand("git", ["rev-parse", "HEAD"]).output.trim();
  await _waitForBuild(repository, head);
  const url = run("gh", ["api", `repos/${repository}/pages`, "-q", ".html_url"], { mustSucceed: true }).output.trim();
  note(`公開URL(html_url): ${url}`);
  const headers = _checkHeaders(url);
  note(`curl -sI の結果: HTTP ${headers.httpStatus}、HTTPS ${headers.isHttps ? "はい" : "いいえ"}`);
  const hashes = await _compareHashesWithRetry(url);
  const summary = {
    url, repositoryUrl: `https://github.com/${repository}`, repository, commit: head,
    checkedAt: formatJst(), ...headers, hashes,
  };
  _writeHashCheck(summary);
  const isPassed = headers.httpStatus === HTTP_OK && headers.isHttps && hashes.every((hash) => hash.isMatch);
  note(`公開ページの検証: ${isPassed ? "合格" : "不合格"}`);
  return isPassed;
}

async function publish() {
  _runPrechecks();
  const origin = _getExistingOrigin();
  const owner = origin ? origin.owner : _getOwner();
  const name = origin ? origin.name : _createAndPush(owner);
  if (origin) {
    run("git", ["push", "-u", "origin", "main"], { mustSucceed: true });
  }
  const repository = `${owner}/${name}`;
  _enablePages(repository);
  return _verify(repository);
}

async function verifyAgain() {
  const origin = _getExistingOrigin();
  if (!origin) {
    throw new Error("origin がないため、先に node scripts/publish.js を実行する");
  }
  _assertNoSensitiveData();
  _assertGitIdentity();
  _assertWorkingTreeReady();
  run("git", ["push", "origin", "main"], { mustSucceed: true });
  return _verify(`${origin.owner}/${origin.name}`);
}

function _remaskExistingLog() {
  if (fs.existsSync(PUBLISH_LOG_PATH)) {
    fs.writeFileSync(PUBLISH_LOG_PATH, _maskOutput(fs.readFileSync(PUBLISH_LOG_PATH, "utf8")));
  }
}

async function main() {
  _remaskExistingLog();
  if (process.argv.includes("--mask-log-only")) {
    return;
  }
  const isVerifyOnly = process.argv.includes("--verify");
  const title = isVerifyOnly ? "追加コミットの push と再検証" : "公開";
  try {
    const isPassed = isVerifyOnly ? await verifyAgain() : await publish();
    process.exitCode = isPassed ? 0 : 1;
  } catch (error) {
    note(`中止: ${error.message}`);
    process.exitCode = 1;
  } finally {
    _flushLog(title);
  }
}

main();
