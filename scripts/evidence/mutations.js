"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { REPOSITORY_ROOT, runNodeTests, writeLog } = require("./testRunner.js");
const { parseJunitFile } = require("./junit.js");

const WORK_DIRECTORY = path.join(REPOSITORY_ROOT, ".mutation-tmp");
const APP_FILES = Object.freeze(["passwordGenerator.js", "app.js", "index.html", "style.css"]);
const TARGET_FILE = "passwordGenerator.js";

/**
 * 7-3 の不良版。search の文字列を replace に置き換えた一時コピーでテストを実行する。
 */
const MUTATIONS = Object.freeze([
  {
    logName: "mutation-1-modulo.log",
    title: "不良版1: 文字の選択を r % n(剰余だけ)に変えた版",
    search: "      if (value < limit) {\n        return value % n;",
    replace: "      if (value >= 0) {\n        return value % n;",
    files: ["tests/unit/randomness.test.js", "tests/integration/generation.test.js"],
    expectedFailures: ["U-13", "I-04"],
    note: "n=94 などの小さい n では偏りが 2^-25 程度以下と小さく、10万件では検出できない。"
      + "検出できる条件として (1) limit ちょうどの値を返すダミー乱数(U-13)、"
      + "(2) n = 3×2^30 と大きい n を実際の crypto で10万回選ぶ区間の検定(I-04)を使う。",
  },
  {
    logName: "mutation-2-math-random.log",
    title: "不良版2: 乱数源を Math.random に変えた版",
    search: "      randomSource(buffer);\n      const value = buffer[0];",
    replace: "      const value = Math.floor(Math.random() * UINT32_RANGE);",
    files: ["tests/security/staticChecks.test.js", "tests/integration/randomSource.test.js"],
    expectedFailures: ["S-01", "I-07", "I-08"],
    note: "N-01 の静的検査(S-01)と、乱数源の差し替えのテスト(I-07・I-08)が失敗することを確認する。",
  },
  {
    logName: "mutation-3-no-guarantee.log",
    title: "不良版3: 文字種の保証を外した版",
    search: "const characters = groups.map((group) => _pickCharacter(group, randomSource));",
    replace: "const characters = [];",
    files: ["tests/unit/characterTypes.test.js", "tests/integration/generation.test.js"],
    expectedFailures: ["U-03", "I-01"],
    note: "F-03 の文字種の保証のテスト(U-03・I-01)が失敗することを確認する。",
  },
]);

function _hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function _prepareMutantDirectory(mutation, index) {
  const directory = path.join(WORK_DIRECTORY, `mutation-${index + 1}`);
  fs.mkdirSync(directory, { recursive: true });
  for (const file of APP_FILES) {
    fs.copyFileSync(path.join(REPOSITORY_ROOT, file), path.join(directory, file));
  }
  const targetPath = path.join(directory, TARGET_FILE);
  const source = fs.readFileSync(targetPath, "utf8");
  if (source.split(mutation.search).length !== 2) {
    throw new Error(`${mutation.logName}: 置き換え対象がちょうど1か所ではない`);
  }
  fs.writeFileSync(targetPath, source.replace(mutation.search, mutation.replace));
  return directory;
}

function _judgeMutation(mutation, results) {
  const failedIds = [...new Set(results.filter((result) => result.status === "fail").map((result) => result.id))];
  const missing = mutation.expectedFailures.filter((id) => !failedIds.includes(id));
  return { failedIds, missing, isDetected: missing.length === 0 };
}

function _formatMutationHeader(mutation, originalHash) {
  return [
    `不良版の内容: ${mutation.title}`,
    `対象ファイル: ${TARGET_FILE}(.mutation-tmp/ の一時コピーだけを書き換え、元のファイルは変更しない)`,
    `元のファイルの SHA-256(実行前): ${originalHash}`,
    "--- 変更前",
    mutation.search,
    "+++ 変更後",
    mutation.replace,
    `検出の条件: ${mutation.note}`,
    `失敗するはずのテスト: ${mutation.expectedFailures.join(", ")}`,
    "",
    "===== テストの出力(不良版に対して実行。失敗するのが期待どおり) =====",
  ];
}

function _runOneMutation(mutation, index, evidenceDirectory) {
  const originalHash = _hashFile(path.join(REPOSITORY_ROOT, TARGET_FILE));
  const directory = _prepareMutantDirectory(mutation, index);
  const junitPath = path.join(directory, "junit.xml");
  const startedAt = new Date();
  const run = runNodeTests({ files: mutation.files, junitPath, env: { PG_APP_DIR: directory } });
  const judgement = _judgeMutation(mutation, parseJunitFile(junitPath));
  const restoredHash = _hashFile(path.join(REPOSITORY_ROOT, TARGET_FILE));
  const footer = [
    "",
    "===== 判定 =====",
    `失敗したテスト: ${judgement.failedIds.join(", ") || "なし"}`,
    `期待どおり失敗しなかったテスト: ${judgement.missing.join(", ") || "なし"}`,
    `判定: ${judgement.isDetected ? "検出できた(期待どおり失敗)" : "検出できなかった"}`,
    `元のファイルの SHA-256(実行後): ${restoredHash}(${restoredHash === originalHash ? "実行前と一致" : "不一致"})`,
  ];
  const output = [..._formatMutationHeader(mutation, originalHash), run.output, ...footer].join("\n");
  writeLog(path.join(evidenceDirectory, mutation.logName), {
    title: mutation.title, commandLine: `PG_APP_DIR=.mutation-tmp/mutation-${index + 1} ${run.commandLine}`,
    output, exitCode: run.exitCode, startedAt,
  });
  return { ...mutation, ...judgement, exitCode: run.exitCode, isRestored: restoredHash === originalHash };
}

/**
 * 3つの不良版でテストを実行し、該当のテストが失敗することを確かめる。
 * @param {string} evidenceDirectory
 * @returns {object[]} 不良版ごとの判定
 */
function runMutations(evidenceDirectory) {
  fs.rmSync(WORK_DIRECTORY, { recursive: true, force: true });
  try {
    return MUTATIONS.map((mutation, index) => _runOneMutation(mutation, index, evidenceDirectory));
  } finally {
    fs.rmSync(WORK_DIRECTORY, { recursive: true, force: true });
  }
}

module.exports = { runMutations, MUTATIONS };
