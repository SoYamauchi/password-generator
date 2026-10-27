"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGenerator } = require("../helpers/appModule.js");

const generator = loadGenerator();
const BITS_TOLERANCE = 1e-6;

function _settings(overrides) {
  return { ...generator.getDefaultSettings(), ...overrides };
}

test("[N-06] U-18 文字種・除外・使う記号・重複除去を変えたときの文字数 N が正しい", () => {
  const cases = [
    { label: "既定(26+26+10+32)", settings: _settings({}), expected: 94 },
    { label: "除外ON(94-5)", settings: _settings({ isAmbiguousExcluded: true }), expected: 89 },
    { label: "記号を重複ありで3種(26+26+10+3)", settings: _settings({ symbols: "!!@#@" }), expected: 65 },
    { label: "記号OFF(26+26+10)", settings: _settings({ hasSymbols: false }), expected: 62 },
    {
      label: "数字のみ+除外(10-2)",
      settings: _settings({ hasUppercase: false, hasLowercase: false, hasSymbols: false, isAmbiguousExcluded: true }),
      expected: 8,
    },
    {
      label: "英大文字のみ+除外(26-2)",
      settings: _settings({ hasLowercase: false, hasDigits: false, hasSymbols: false, isAmbiguousExcluded: true }),
      expected: 24,
    },
    {
      label: "英小文字のみ+除外(26-1)",
      settings: _settings({ hasUppercase: false, hasDigits: false, hasSymbols: false, isAmbiguousExcluded: true }),
      expected: 25,
    },
  ];
  for (const { label, settings, expected } of cases) {
    assert.equal(generator.calculateStrength(settings).charsetSize, expected, label);
  }
});

test("[N-06] U-19 強度が L × log2(N) と一致する(手計算値と比較)", () => {
  // 手計算: log2(94) = 6.5545888516776..., 24 × 6.5545888516776 = 157.3101324402...
  const defaultStrength = generator.calculateStrength(_settings({}));
  assert.ok(Math.abs(defaultStrength.bits - 157.3101324402) < BITS_TOLERANCE);
  assert.equal(defaultStrength.level.label, "非常に強い");
  // 手計算: 8 × log2(10) = 8 × 3.3219280948873 = 26.5754247590989
  const digitsOnly = generator.calculateStrength(
    _settings({ length: 8, hasUppercase: false, hasLowercase: false, hasSymbols: false }),
  );
  assert.ok(Math.abs(digitsOnly.bits - 26.5754247590989) < BITS_TOLERANCE);
  assert.equal(digitsOnly.level.label, "弱い");
  // 手計算: 16 × log2(62) = 16 × 5.9541963103869 = 95.2671409661900
  const noSymbols = generator.calculateStrength(_settings({ length: 16, hasSymbols: false }));
  assert.ok(Math.abs(noSymbols.bits - 95.26714096619) < BITS_TOLERANCE);
  assert.equal(noSymbols.level.label, "強い");
});

test("[N-06] U-20 強度の段階の閾値(50・80・112 bit)の境界", () => {
  const cases = [
    [0, "弱い"], [49.999, "弱い"], [50, "普通"], [79.999, "普通"],
    [80, "強い"], [111.999, "強い"], [112, "非常に強い"], [1000, "非常に強い"],
  ];
  for (const [bits, label] of cases) {
    assert.equal(generator.getStrengthLevel(bits).label, label, `${bits} bit`);
  }
});

test("[N-09] U-21 保存された設定値の検証(不正なJSON・範囲外・型違い・未知の項目・null は初期値に戻る)", () => {
  const defaults = generator.getDefaultSettings();
  const valid = _settings({ length: 32, hasSymbols: false, isAmbiguousExcluded: true, symbols: "#$" });
  const invalidInputs = [
    "{broken", "", "null", "[]", "42", "\"text\"", null,
    JSON.stringify({ ...valid, length: 7 }),
    JSON.stringify({ ...valid, length: 129 }),
    JSON.stringify({ ...valid, length: "32" }),
    JSON.stringify({ ...valid, length: 32.5 }),
    JSON.stringify({ ...valid, hasDigits: "true" }),
    JSON.stringify({ ...valid, symbols: 123 }),
    JSON.stringify({ ...valid, symbols: "abc" }),
    JSON.stringify({ ...valid, unknownKey: true }),
    JSON.stringify({ length: 32 }),
    JSON.stringify({ ...valid, hasUppercase: false, hasLowercase: false, hasDigits: false }),
    JSON.stringify({ ...valid, hasSymbols: true, symbols: "" }),
  ];
  for (const input of invalidInputs) {
    assert.deepEqual(generator.parseStoredSettings(input), defaults, `入力 ${String(input)}`);
  }
  assert.deepEqual(generator.parseStoredSettings(JSON.stringify(valid)), valid);
  assert.deepEqual(generator.parseStoredSettings(JSON.stringify({ ...valid, symbols: "##$" })), valid);
});

test("[N-05][F-09] U-22 保存する文字列は設定の項目だけで、パスワードを含まない", () => {
  const settingsWithPassword = { ...generator.getDefaultSettings(), password: "dummy-generated-value" };
  const serialized = generator.serializeSettings(settingsWithPassword);
  assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), Object.keys(generator.getDefaultSettings()).sort());
  assert.equal(serialized.includes("dummy-generated-value"), false);
});
