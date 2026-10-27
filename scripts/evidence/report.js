"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { REQUIREMENT_MATRIX, LAYER_LABELS } = require("./requirementMatrix.js");

const RESULT_LABELS = Object.freeze({ pass: "合", fail: "否", skipped: "未実施" });

function _escapeCell(text) {
  return String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function _findLogLine(logText, testName) {
  const index = logText.split("\n").findIndex((line) => line.includes(testName));
  return index < 0 ? null : index + 1;
}

function _evidenceFor(tests, layers) {
  return tests.map((test) => {
    const layer = layers.find((candidate) => candidate.results.includes(test));
    const line = layer ? _findLogLine(layer.logText, test.name) : null;
    return layer ? `${layer.logFile}${line ? `:${line}` : ""}` : "";
  }).filter(Boolean);
}

function _evaluateRow(row, layers) {
  const allResults = layers.flatMap((layer) => layer.results);
  const tests = allResults.filter((result) => row.tests.includes(result.id));
  const missingIds = row.tests.filter((id) => !tests.some((test) => test.id === id));
  const failed = tests.filter((test) => test.status === "fail");
  const skipped = tests.filter((test) => test.status === "skipped");
  if (tests.length === 0 || skipped.length === tests.length) {
    const reason = skipped[0] ? skipped[0].skipReason : "テストが実行されていない";
    return { result: "未実施", tests, note: `理由: ${reason}。代わりの確認手順: README の「手動確認」を参照` };
  }
  if (failed.length > 0 || missingIds.length > 0) {
    const names = failed.map((test) => test.id).concat(missingIds.map((id) => `${id}(結果なし)`));
    return { result: "否", tests, note: `不合格: ${[...new Set(names)].join(", ")}。原因はログの該当行を参照` };
  }
  const note = skipped.length > 0 ? `${skipped.length}件は未実施(${skipped[0].skipReason})` : "";
  return { result: "合", tests, note };
}

function _countTests(layers) {
  const counts = { pass: 0, fail: 0, skipped: 0 };
  for (const result of layers.flatMap((layer) => layer.results)) {
    counts[result.status] += 1;
  }
  return counts;
}

function _formatMatrix(rows, checkedDate) {
  const header = [
    "| 要件ID | テスト観点 | テストID(テスト名) | 結果(合/否/未実施) | 確認日 | エビデンス(ファイルと該当行) | 備考 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const lines = rows.map(({ row, evaluation, evidence }) => {
    const testNames = evaluation.tests.length > 0
      ? [...new Set(evaluation.tests.map((test) => test.name))].join("<br>")
      : row.tests.join(", ");
    return `| ${_escapeCell(row.ids)} | ${_escapeCell(`[${LAYER_LABELS[row.layer]}] ${row.viewpoint}`)} `
      + `| ${_escapeCell(testNames)} | ${evaluation.result} | ${checkedDate} `
      + `| ${_escapeCell(evidence.join(", "))} | ${_escapeCell(evaluation.note)} |`;
  });
  return [...header, ...lines];
}

function _formatMutations(mutations) {
  const lines = [
    "| 不良版 | 失敗するはずのテスト | 実際に失敗したテスト | 判定 | エビデンス |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const mutation of mutations) {
    lines.push(`| ${_escapeCell(mutation.title)} | ${mutation.expectedFailures.join(", ")} `
      + `| ${mutation.failedIds.join(", ") || "なし"} | ${mutation.isDetected ? "合(検出できた)" : "否(検出できなかった)"} `
      + `| evidence/${mutation.logName} |`);
  }
  return lines;
}

function _formatPublishSummary(publishSummary) {
  if (!publishSummary) {
    return ["公開の検証は未実施です(evidence/publish-summary.json がない)。"];
  }
  const hashLines = publishSummary.hashes.map((hash) =>
    `| ${hash.file} | ${hash.local} | ${hash.remote} | ${hash.isMatch ? "合" : "否"} |`);
  return [
    `- 公開URL: ${publishSummary.url}`,
    `- リポジトリ: ${publishSummary.repositoryUrl}`,
    `- 確認日時: ${publishSummary.checkedAt}`,
    `- curl -sI: HTTP ${publishSummary.httpStatus}、HTTPS ${publishSummary.isHttps ? "はい" : "いいえ"} → `
      + `${publishSummary.httpStatus === 200 && publishSummary.isHttps ? "合" : "否"}(evidence/publish-log.txt)`,
    "",
    "| ファイル | ローカルの SHA-256 | 公開ページの SHA-256 | 一致 |",
    "| --- | --- | --- | --- |",
    ...hashLines,
    "",
    "(evidence/deployed-hash-check.txt)",
  ];
}

function _formatHeader(data, { rowCounts, testCounts, rowTotal }) {
  const testTotal = testCounts.pass + testCounts.fail + testCounts.skipped;
  return [
    "# テスト結果レポート",
    "",
    `- 実行日時: ${data.generatedAt}`,
    `- 環境: ${data.environmentSummary}(詳細は evidence/environment.txt)`,
    `- テストケースの件数: 合格 ${testCounts.pass}・不合格 ${testCounts.fail}・未実施 ${testCounts.skipped}`
      + `(合計 ${testTotal}。JUnit から集計)`,
    `- テスト観点(下表の行)の件数: 合 ${rowCounts.合}・否 ${rowCounts.否}・未実施 ${rowCounts.未実施}(合計 ${rowTotal})`,
    "- このファイルは scripts/runEvidence.js が JUnit とログから機械的に生成したもので、手で書き換えていない。",
    "",
  ];
}

/**
 * test-report.md の本文を作る。
 * @param {object} data runEvidence.js が集めた結果
 * @returns {{text: string, summary: object}}
 */
function buildReport(data) {
  const rows = REQUIREMENT_MATRIX.map((row) => {
    const evaluation = _evaluateRow(row, data.layers);
    return { row, evaluation, evidence: _evidenceFor(evaluation.tests, data.layers) };
  });
  const rowCounts = { 合: 0, 否: 0, 未実施: 0 };
  rows.forEach(({ evaluation }) => rowCounts[evaluation.result]++);
  const testCounts = _countTests(data.layers);
  const summary = { rowCounts, testCounts, rowTotal: rows.length };
  const text = [
    ..._formatHeader(data, summary),
    "## テスト観点と結果(要件定義書 7-2 の全行)",
    "",
    ..._formatMatrix(rows, data.checkedDate),
    "",
    `照合: 7-2 の観点 ${REQUIREMENT_MATRIX.length} 行がすべて表にある(requirementMatrix.js の全行を出力)。`,
    "",
    ...data.extraSections,
    "## 不良版でテストが失敗することの確認(7-3)",
    "",
    ..._formatMutations(data.mutations),
    "",
    "## 公開ページの検証(9-2)",
    "",
    ..._formatPublishSummary(data.publishSummary),
    "",
  ].join("\n");
  return { text, summary };
}

/**
 * 公開スクリプトが残した要約を読む。なければ null。
 * @param {string} evidenceDirectory
 * @returns {object | null}
 */
function readPublishSummary(evidenceDirectory) {
  const filePath = path.join(evidenceDirectory, "publish-summary.json");
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

module.exports = { buildReport, readPublishSummary, RESULT_LABELS };
