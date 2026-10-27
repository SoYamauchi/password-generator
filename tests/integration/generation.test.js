"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGenerator } = require("../helpers/appModule.js");
const { runChiSquareTest, logStatistic } = require("../helpers/statistics.js");

const generator = loadGenerator();
const SAMPLE_COUNT = 100000;
const ALPHA = 0.001;
const LARGE_N = 3 * 2 ** 30;
const LARGE_N_BINS = 3;
const TYPE_DEFINITIONS = Object.freeze([
  { key: "hasUppercase", name: "英大文字", characters: generator.UPPERCASE },
  { key: "hasLowercase", name: "英小文字", characters: generator.LOWERCASE },
  { key: "hasDigits", name: "数字", characters: generator.DIGITS },
  { key: "hasSymbols", name: "記号", characters: generator.DEFAULT_SYMBOLS },
]);
const CONFIGURATIONS = Object.freeze([
  { label: "既定(長さ24・全文字種)", settings: generator.getDefaultSettings() },
  {
    label: "長さ8・除外ON・記号5種",
    settings: { ...generator.getDefaultSettings(), length: 8, isAmbiguousExcluded: true, symbols: "!@#$%" },
  },
  {
    label: "長さ32・英大文字と数字・除外ON",
    settings: {
      ...generator.getDefaultSettings(), length: 32, hasLowercase: false, hasSymbols: false, isAmbiguousExcluded: true,
    },
  },
]);

let defaultSamples = null;

function _getDefaultSamples() {
  if (!defaultSamples) {
    const settings = generator.getDefaultSettings();
    defaultSamples = Array.from({ length: SAMPLE_COUNT }, () => generator.generatePassword(settings));
  }
  return defaultSamples;
}

function _checkPassword(password, settings, groups) {
  const allowed = groups.join("");
  if (password.length !== settings.length) {
    return "長さ";
  }
  if (![...password].every((character) => allowed.includes(character))) {
    return "使える文字";
  }
  if (!groups.every((group) => [...password].some((character) => group.includes(character)))) {
    return "文字種の保証";
  }
  const hasAmbiguous = [...password].some((character) => generator.AMBIGUOUS_CHARACTERS.includes(character));
  return settings.isAmbiguousExcluded && hasAmbiguous ? "除外" : null;
}

test("[F-01][F-02][F-03][F-04][F-05] I-01 既定と複数の設定で10万件生成し、長さ・文字・保証・除外が1件も破れない", () => {
  for (const { label, settings } of CONFIGURATIONS) {
    const groups = generator.buildCharacterGroups(settings);
    const violations = {};
    const samples = label.startsWith("既定") ? _getDefaultSamples() : null;
    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      const password = samples ? samples[i] : generator.generatePassword(settings);
      const violation = _checkPassword(password, settings, groups);
      if (violation) {
        violations[violation] = (violations[violation] || 0) + 1;
      }
    }
    logStatistic("I-01 制約違反", { 設定: label, 件数: SAMPLE_COUNT, 違反: JSON.stringify(violations) });
    assert.deepEqual(violations, {}, label);
  }
});

function _countCharacters(samples) {
  const counts = new Map();
  for (const password of samples) {
    for (const character of password) {
      counts.set(character, (counts.get(character) || 0) + 1);
    }
  }
  return counts;
}

test("[N-02] I-02 文字の偏り: 同じ文字種の中の各文字の出現回数が均等(カイ二乗検定・有意水準0.1%)", () => {
  const counts = _countCharacters(_getDefaultSamples());
  for (const { name, characters } of TYPE_DEFINITIONS) {
    const observed = [...characters].map((character) => counts.get(character) || 0);
    const total = observed.reduce((sum, count) => sum + count, 0);
    const expected = observed.map(() => total / characters.length);
    const result = runChiSquareTest(observed, expected, ALPHA);
    logStatistic("I-02 文字種内の均等性", {
      文字種: name, 統計量: result.statistic, 自由度: result.degreesOfFreedom,
      臨界値: result.criticalValue, p値: result.pValue, 有意水準: ALPHA, 判定: result.isAccepted ? "合" : "否",
    });
    assert.ok(result.isAccepted, `${name}: 統計量 ${result.statistic} > 臨界値 ${result.criticalValue}`);
  }
});

test("[N-02] I-03 文字種ごとの出現数が期待値 1 + (L - k) × m / N と合う(カイ二乗検定・有意水準0.1%)", () => {
  const settings = generator.getDefaultSettings();
  const counts = _countCharacters(_getDefaultSamples());
  const charsetSize = TYPE_DEFINITIONS.reduce((sum, { characters }) => sum + characters.length, 0);
  const typeCount = TYPE_DEFINITIONS.length;
  const observed = TYPE_DEFINITIONS.map(({ characters }) =>
    [...characters].reduce((sum, character) => sum + (counts.get(character) || 0), 0));
  const expected = TYPE_DEFINITIONS.map(({ characters }) =>
    SAMPLE_COUNT * (1 + ((settings.length - typeCount) * characters.length) / charsetSize));
  const result = runChiSquareTest(observed, expected, ALPHA);
  TYPE_DEFINITIONS.forEach(({ name }, index) => {
    logStatistic("I-03 文字種の出現数", { 文字種: name, 観測: observed[index], 期待: expected[index] });
  });
  logStatistic("I-03 文字種の出現数の検定", {
    統計量: result.statistic, 自由度: result.degreesOfFreedom, 臨界値: result.criticalValue,
    p値: result.pValue, 有意水準: ALPHA, 判定: result.isAccepted ? "合" : "否",
  });
  assert.ok(result.isAccepted);
});

test("[N-02] I-04 モジュロバイアスの検出条件: n = 3×2^30 で添字を3区間に分けると均等(カイ二乗検定・有意水準0.1%)", () => {
  // n が 2^32 に近いと、剰余だけの実装では先頭の区間が約2倍選ばれる。棄却サンプリングなら均等になる
  const cryptoSource = (array) => globalThis.crypto.getRandomValues(array);
  const binSize = LARGE_N / LARGE_N_BINS;
  const observed = new Array(LARGE_N_BINS).fill(0);
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    observed[Math.floor(generator.getRandomIndex(LARGE_N, cryptoSource) / binSize)] += 1;
  }
  const expected = observed.map(() => SAMPLE_COUNT / LARGE_N_BINS);
  const result = runChiSquareTest(observed, expected, ALPHA);
  logStatistic("I-04 大きいnの区間均等性", {
    n: LARGE_N, 観測: observed.join("/"), 統計量: result.statistic, 自由度: result.degreesOfFreedom,
    臨界値: result.criticalValue, p値: result.pValue, 有意水準: ALPHA, 判定: result.isAccepted ? "合" : "否",
  });
  assert.ok(result.isAccepted);
});

test("[N-03] I-05 位置の偏り: 各文字種の文字が現れる位置が均等(位置ごとのカイ二乗検定・有意水準0.1%)", () => {
  const length = generator.DEFAULT_LENGTH;
  for (const { name, characters } of TYPE_DEFINITIONS) {
    const observed = new Array(length).fill(0);
    for (const password of _getDefaultSamples()) {
      for (let position = 0; position < length; position += 1) {
        observed[position] += characters.includes(password[position]) ? 1 : 0;
      }
    }
    const total = observed.reduce((sum, count) => sum + count, 0);
    const result = runChiSquareTest(observed, observed.map(() => total / length), ALPHA);
    logStatistic("I-05 位置の均等性", {
      文字種: name, 統計量: result.statistic, 自由度: result.degreesOfFreedom, 臨界値: result.criticalValue,
      p値: result.pValue, 有意水準: ALPHA, 判定: result.isAccepted ? "合" : "否",
    });
    assert.ok(result.isAccepted, `${name} の位置に偏りがある`);
  }
});

test("[N-01] I-06 重複なし: 長さ24・全文字種で10万件生成して重複が0件(暗号論的な安全性の証明ではない)", () => {
  const samples = _getDefaultSamples();
  const duplicateCount = samples.length - new Set(samples).size;
  logStatistic("I-06 重複件数", {
    件数: samples.length, 重複: duplicateCount,
    注記: "シードや時刻に依存していないことの目安であり、暗号論的な安全性の証明ではない",
  });
  assert.equal(duplicateCount, 0);
});
