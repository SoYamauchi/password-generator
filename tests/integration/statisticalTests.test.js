"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGenerator } = require("../helpers/appModule.js");
const { erfc, logStatistic } = require("../helpers/statistics.js");

const generator = loadGenerator();
const BIT_COUNT = 1000000;
const NIST_ALPHA = 0.01;
const NOTE = "簡易版の統計検定であり、安全性の証明ではない";

function _collectBits() {
  // 生成で使う経路(getRandomIndex)を通して、0/1 を取り出す
  const cryptoSource = (array) => globalThis.crypto.getRandomValues(array);
  const bits = new Uint8Array(BIT_COUNT);
  for (let i = 0; i < BIT_COUNT; i += 1) {
    bits[i] = generator.getRandomIndex(2, cryptoSource);
  }
  return bits;
}

function _runFrequencyTest(bits) {
  const sum = bits.reduce((total, bit) => total + (bit === 1 ? 1 : -1), 0);
  const observed = Math.abs(sum) / Math.sqrt(bits.length);
  return { pValue: erfc(observed / Math.SQRT2), ones: bits.reduce((total, bit) => total + bit, 0) };
}

function _runRunsTest(bits, ones) {
  const n = bits.length;
  const proportion = ones / n;
  let runs = 1;
  for (let i = 0; i < n - 1; i += 1) {
    runs += bits[i] === bits[i + 1] ? 0 : 1;
  }
  const spread = proportion * (1 - proportion);
  const pValue = erfc(Math.abs(runs - 2 * n * spread) / (2 * Math.sqrt(2 * n) * spread));
  return { pValue, runs };
}

test("[N-01] I-11 (任意)NIST SP 800-22 の頻度検定・連の検定の簡易版(安全性の証明ではない)", () => {
  const bits = _collectBits();
  const frequency = _runFrequencyTest(bits);
  const runs = _runRunsTest(bits, frequency.ones);
  logStatistic("I-11 頻度検定(monobit)", {
    ビット数: BIT_COUNT, 一の数: frequency.ones, p値: frequency.pValue, 有意水準: NIST_ALPHA,
    判定: frequency.pValue >= NIST_ALPHA ? "合" : "否", 注記: NOTE,
  });
  logStatistic("I-11 連の検定(runs)", {
    ビット数: BIT_COUNT, 連の数: runs.runs, p値: runs.pValue, 有意水準: NIST_ALPHA,
    判定: runs.pValue >= NIST_ALPHA ? "合" : "否", 注記: NOTE,
  });
  assert.ok(frequency.pValue >= NIST_ALPHA);
  assert.ok(runs.pValue >= NIST_ALPHA);
});
