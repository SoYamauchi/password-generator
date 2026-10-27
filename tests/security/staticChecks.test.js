"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { APP_DIRECTORY } = require("../helpers/appModule.js");
const {
  CREDENTIAL_PATTERNS,
  createLocalIdentityPatterns,
  findSensitiveMatches,
  listRepositoryTextFiles,
} = require("../helpers/sensitivePatterns.js");

const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");

function _readAppFile(fileName) {
  return fs.readFileSync(path.join(APP_DIRECTORY, fileName), "utf8");
}

/**
 * 各ファイルでのパターンの出現件数を数えてログに出し、件数の表を返す。
 */
function _countPatterns(fileNames, patterns) {
  const table = {};
  for (const fileName of fileNames) {
    const source = _readAppFile(fileName);
    for (const { label, regex } of patterns) {
      const count = (source.match(new RegExp(regex.source, `${regex.flags.replace("g", "")}g`)) || []).length;
      table[`${fileName}: ${label}`] = count;
      console.log(`[SCAN] ${fileName} / ${label}: ${count} 件`);
    }
  }
  return table;
}

test("[N-01] S-01 アプリ本体に Math.random・Date.now・performance.now・シード等がなく、乱数は getRandomValues だけ", () => {
  const forbidden = [
    { label: "Math.random", regex: /Math\s*\.\s*random/ },
    { label: "Date.now", regex: /Date\s*\.\s*now/ },
    { label: "new Date(", regex: /new\s+Date\s*\(/ },
    { label: "performance.now", regex: /performance\s*\.\s*now/ },
    { label: "seed(固定シード)", regex: /seed/i },
    { label: "xorshift 等の擬似乱数", regex: /xorshift|mulberry|lcg|mersenne/i },
  ];
  const counts = _countPatterns(["passwordGenerator.js", "app.js", "index.html"], forbidden);
  assert.ok(Object.values(counts).every((count) => count === 0), JSON.stringify(counts));

  const generatorSource = _readAppFile("passwordGenerator.js");
  const getRandomValuesCount = (generatorSource.match(/getRandomValues\(/g) || []).length;
  console.log(`[SCAN] passwordGenerator.js / getRandomValues( の呼び出し: ${getRandomValuesCount} 件`);
  assert.ok(getRandomValuesCount >= 1, "乱数の取得に getRandomValues を使う");
  assert.equal((_readAppFile("app.js").match(/getRandomValues|crypto\s*\./g) || []).length, 0, "app.js は乱数源を直接使わない");
});

test("[N-09] S-02 アプリ本体に innerHTML・outerHTML・insertAdjacentHTML・eval・new Function・document.write がない", () => {
  const forbidden = [
    { label: "innerHTML", regex: /innerHTML/ },
    { label: "outerHTML", regex: /outerHTML/ },
    { label: "insertAdjacentHTML", regex: /insertAdjacentHTML/ },
    { label: "eval", regex: /\beval\s*\(/ },
    { label: "new Function", regex: /new\s+Function\b/ },
    { label: "document.write", regex: /document\s*\.\s*write/ },
    { label: "setTimeout/setInterval に文字列", regex: /set(Timeout|Interval)\s*\(\s*["'`]/ },
  ];
  const counts = _countPatterns(["passwordGenerator.js", "app.js", "index.html"], forbidden);
  assert.ok(Object.values(counts).every((count) => count === 0), JSON.stringify(counts));
});

function _parseCspMeta(html) {
  const metas = html.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/gi) || [];
  assert.equal(metas.length, 1, "CSP の meta タグは1つ");
  const content = metas[0].match(/content="([^"]*)"/i)[1];
  const directives = {};
  for (const part of content.split(";").map((value) => value.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    directives[name] = values;
  }
  console.log(`[SCAN] index.html / CSP: ${content}`);
  return { metaTag: metas[0], directives };
}

test("[N-04] S-03 index.html に仕様どおりのCSPがあり、インラインスクリプト・イベント属性・外部URLがない", () => {
  const html = _readAppFile("index.html");
  const { metaTag, directives } = _parseCspMeta(html);
  assert.deepEqual(directives["script-src"], ["'self'"], "script-src は自サイトだけ");
  assert.deepEqual(directives["connect-src"], ["'none'"], "connect-src は 'none'");
  assert.deepEqual(directives["default-src"], ["'none'"], "default-src は 'none'");
  assert.ok(html.indexOf(metaTag) < html.search(/<(script|link)\b/i), "CSP は script・link より前にある");

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const inlineScripts = scripts.filter(([, attributes, body]) => !/\bsrc=/.test(attributes) || body.trim() !== "");
  const eventAttributes = html.match(/\son[a-z]+\s*=/gi) || [];
  const styleAttributes = html.match(/\sstyle\s*=/gi) || [];
  const externalUrls = html.match(/https?:\/\/|\/\//gi) || [];
  console.log(`[SCAN] index.html / script タグ: ${scripts.length} 件(インライン ${inlineScripts.length} 件)`);
  console.log(`[SCAN] index.html / イベント属性: ${eventAttributes.length} 件、style 属性: ${styleAttributes.length} 件`);
  console.log(`[SCAN] index.html / 外部URL(http://, https://, //): ${externalUrls.length} 件`);
  assert.equal(inlineScripts.length, 0);
  assert.equal(eventAttributes.length, 0);
  assert.equal(styleAttributes.length, 0);
  assert.equal(externalUrls.length, 0);
});

test("[N-04] S-04 アプリ本体のJS・CSSに外部URLと通信APIがない", () => {
  const forbidden = [
    { label: "外部URL", regex: /https?:\/\/|url\(\s*["']?\/\// },
    { label: "@import", regex: /@import/ },
    { label: "通信API", regex: /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/ },
  ];
  const counts = _countPatterns(["passwordGenerator.js", "app.js", "style.css"], forbidden);
  assert.ok(Object.values(counts).every((count) => count === 0), JSON.stringify(counts));
});

test("[N-04][N-10] S-05 リポジトリ内に秘密情報らしい文字列がない", () => {
  const files = listRepositoryTextFiles(REPOSITORY_ROOT);
  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(REPOSITORY_ROOT, file), "utf8");
    for (const finding of findSensitiveMatches(text, CREDENTIAL_PATTERNS)) {
      findings.push(`${file}:${finding.line} ${finding.label}`);
    }
  }
  console.log(`[SCAN] 秘密情報の検査: ファイル ${files.length} 件、パターン ${CREDENTIAL_PATTERNS.length} 種、検出 ${findings.length} 件`);
  findings.forEach((finding) => console.log(`[SCAN] 検出: ${finding}`));
  assert.deepEqual(findings, []);
});

test("[N-10] S-06 リポジトリ内に個人情報(ホームのパス・PC名・ユーザー名・メール・IPアドレス)がない", () => {
  const files = listRepositoryTextFiles(REPOSITORY_ROOT);
  const patterns = createLocalIdentityPatterns();
  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(REPOSITORY_ROOT, file), "utf8");
    for (const finding of findSensitiveMatches(text, patterns, { includePersonalFormats: true })) {
      findings.push(`${file}:${finding.line} ${finding.label}`);
    }
  }
  console.log(`[SCAN] 個人情報の検査: ファイル ${files.length} 件、検出 ${findings.length} 件`);
  findings.forEach((finding) => console.log(`[SCAN] 検出: ${finding}`));
  assert.deepEqual(findings, []);
});

test("[静的解析] S-07 ESLint の警告・エラーが0件", () => {
  const eslintBin = path.join(REPOSITORY_ROOT, "node_modules", "eslint", "bin", "eslint.js");
  const result = spawnSync(process.execPath, [eslintBin, ".", "--max-warnings", "0"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });
  console.log(`[SCAN] ESLint 終了コード: ${result.status}`);
  if (result.stdout.trim()) {
    console.log(result.stdout);
  }
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
