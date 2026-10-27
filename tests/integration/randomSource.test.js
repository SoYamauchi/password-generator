"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGenerator } = require("../helpers/appModule.js");
const { createSequenceSource, createXorshiftSource } = require("../helpers/randomSources.js");
const { logStatistic } = require("../helpers/statistics.js");

const generator = loadGenerator();
const SEQUENCE_LENGTH = 400;
const TIMING_RUNS = 1000;
const TARGET_MILLISECONDS = 100;

function _createValues(seed) {
  const values = new Uint32Array(SEQUENCE_LENGTH);
  createXorshiftSource(seed)(values);
  return [...values];
}

/**
 * globalThis の項目を一時的に差し替えて処理を実行し、必ず元に戻す。
 */
function _withReplacedGlobal(target, key, replacement, action) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value: replacement, configurable: true, writable: true });
  try {
    return action();
  } finally {
    Object.defineProperty(target, key, original);
  }
}

function _throwIfCalled(name) {
  return () => {
    throw new Error(`${name} must not be used`);
  };
}

test("[N-01] I-07 乱数源の差し替え: 同じ有限の値の列からは同じパスワードになり、出力が列だけで決まる", () => {
  const settings = generator.getDefaultSettings();
  const values = _createValues(99);
  const throwingCrypto = { getRandomValues: _throwIfCalled("crypto.getRandomValues") };
  const [first, second, other] = _withReplacedGlobal(globalThis, "crypto", throwingCrypto, () => [
    generator.generatePassword(settings, createSequenceSource(values)),
    generator.generatePassword(settings, createSequenceSource(values)),
    generator.generatePassword(settings, createSequenceSource(_createValues(100))),
  ]);
  assert.equal(first, second, "同じ列からは同じパスワード");
  assert.notEqual(first, other, "別の列からは別のパスワード");
  assert.equal(first.length, settings.length);
});

test("[N-01] I-08 Math.random を例外を投げるダミーにしても、生成が成功する", () => {
  const settings = generator.getDefaultSettings();
  const password = _withReplacedGlobal(Math, "random", _throwIfCalled("Math.random"), () =>
    generator.generatePassword(settings));
  assert.equal(password.length, settings.length);
});

test("[N-01][N-09] I-09 crypto.getRandomValues が使えないと、別の乱数に切り替わらずエラーになり、生成されない", () => {
  const settings = generator.getDefaultSettings();
  let mathRandomCalls = 0;
  const countingRandom = () => {
    mathRandomCalls += 1;
    return 0;
  };
  for (const unavailableCrypto of [undefined, {}, { getRandomValues: "not a function" }]) {
    _withReplacedGlobal(Math, "random", countingRandom, () => {
      _withReplacedGlobal(globalThis, "crypto", unavailableCrypto, () => {
        assert.throws(() => generator.generatePassword(settings), (error) => error.code === "RANDOM_UNAVAILABLE");
      });
    });
  }
  assert.equal(mathRandomCalls, 0, "Math.random に切り替わらない");
});

test("[N-08] I-10 生成時間の計測(Node、既定の設定)", () => {
  const settings = generator.getDefaultSettings();
  const durations = [];
  for (let i = 0; i < TIMING_RUNS; i += 1) {
    const startedAt = process.hrtime.bigint();
    generator.generatePassword(settings);
    durations.push(Number(process.hrtime.bigint() - startedAt) / 1e6);
  }
  durations.sort((a, b) => a - b);
  const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const maximum = durations[durations.length - 1];
  logStatistic("I-10 生成時間(Node)", { 回数: TIMING_RUNS, 平均ms: average, 最大ms: maximum, 目安ms: TARGET_MILLISECONDS });
  assert.ok(maximum < TARGET_MILLISECONDS);
});
