"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGenerator } = require("../helpers/appModule.js");
const { createXorshiftSource, createSequenceSource } = require("../helpers/randomSources.js");

const generator = loadGenerator();
const SEED = 20261027;
const VALID_LENGTHS = Object.freeze([8, 16, 24, 128]);
const INVALID_LENGTHS = Object.freeze([
  { label: "7", value: 7 },
  { label: "129", value: 129 },
  { label: "文字列の7", value: "7" },
  { label: "文字列の129", value: "129" },
  { label: "空欄", value: "" },
  { label: "空白のみ", value: "   " },
  { label: "負数", value: -24 },
  { label: "文字列の負数", value: "-24" },
  { label: "小数", value: 24.5 },
  { label: "文字列の小数", value: "1.5" },
  { label: "文字列", value: "abc" },
  { label: "NaN", value: Number.NaN },
  { label: "1e9", value: 1e9 },
  { label: "文字列の1e9", value: "1e9" },
  { label: "Infinity", value: Number.POSITIVE_INFINITY },
  { label: "null", value: null },
]);
const MAX_ERROR_MILLISECONDS = 50;

test("[F-01] U-01 長さ8・16・24・128で指定どおりの長さになる", () => {
  const randomSource = createXorshiftSource(SEED);
  for (const length of VALID_LENGTHS) {
    const settings = { ...generator.getDefaultSettings(), length };
    assert.equal(generator.validateLength(length).isValid, true);
    assert.equal(generator.validateLength(String(length)).value, length);
    assert.equal(generator.generatePassword(settings, randomSource).length, length);
  }
});

test("[F-01] U-02 範囲外・空欄・負数・小数・文字列・NaN・1e9はエラーになり、生成しない(固まらない)", () => {
  for (const { label, value } of INVALID_LENGTHS) {
    const randomSource = createSequenceSource([0], { maxCalls: 1 });
    const settings = { ...generator.getDefaultSettings(), length: value };
    const startedAt = process.hrtime.bigint();
    assert.equal(generator.validateLength(value).isValid, false, `${label} は不正`);
    assert.throws(
      () => generator.generatePassword(settings, randomSource),
      (error) => error instanceof generator.PasswordGeneratorError && error.code.startsWith("LENGTH_"),
      `${label} はエラーになる`,
    );
    const elapsedMilliseconds = Number(process.hrtime.bigint() - startedAt) / 1e6;
    assert.equal(randomSource.getCallCount(), 0, `${label} では乱数を使わない(生成しない)`);
    assert.ok(elapsedMilliseconds < MAX_ERROR_MILLISECONDS, `${label} は即座に終わる`);
  }
});
