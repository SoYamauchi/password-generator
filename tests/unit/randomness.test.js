"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGenerator } = require("../helpers/appModule.js");
const { createSequenceSource } = require("../helpers/randomSources.js");

const generator = loadGenerator();
const UINT32_RANGE = 2 ** 32;
const UINT32_MAX = UINT32_RANGE - 1;
const MAX_CALLS = 10;

function _limitFor(n) {
  return Math.floor(UINT32_RANGE / n) * n;
}

test("[N-02] U-13 棄却サンプリングの境界値(limit ちょうどは棄却、limit-1 は採用)", () => {
  // n=3 の limit は手計算で 4294967295(= 2^32 - 1)
  assert.equal(_limitFor(3), 4294967295);
  for (const n of [3, 10, 26, 94, 1000003]) {
    const limit = _limitFor(n);
    const rejectedThenAccepted = createSequenceSource([limit, limit - 1], { maxCalls: MAX_CALLS });
    assert.equal(generator.getRandomIndex(n, rejectedThenAccepted), (limit - 1) % n);
    assert.equal(rejectedThenAccepted.getCallCount(), 2, `n=${n}: limit は棄却される`);

    // 2のべき乗でない n では limit <= 2^32 - 1 なので、最大値は必ず limit 以上になる
    const aboveLimit = createSequenceSource([UINT32_MAX, 0], { maxCalls: MAX_CALLS });
    assert.equal(generator.getRandomIndex(n, aboveLimit), 0);
    assert.equal(aboveLimit.getCallCount(), 2, `n=${n}: limit より大きい値は棄却される`);

    const accepted = createSequenceSource([limit - 1], { maxCalls: MAX_CALLS });
    assert.equal(generator.getRandomIndex(n, accepted), (limit - 1) % n);
    assert.equal(accepted.getCallCount(), 1, `n=${n}: limit-1 は1回で採用される`);
  }
});

test("[N-02] U-14 n が2のべき乗のときは棄却されない", () => {
  for (let exponent = 0; exponent <= 32; exponent += 1) {
    const n = 2 ** exponent;
    const source = createSequenceSource([UINT32_MAX], { maxCalls: 1 });
    assert.equal(generator.getRandomIndex(n, source), UINT32_MAX % n);
    assert.equal(source.getCallCount(), 1, `n=2^${exponent}`);
  }
});

test("[N-02] U-15 棄却が上限回数まで続いたら、無限に繰り返さずエラーになる", () => {
  const n = 3;
  const values = new Array(generator.MAX_REJECTIONS).fill(_limitFor(n));
  values.push(0); // 採用される値も列に含めるが、上限に達した時点で止まる
  const source = createSequenceSource(values, { maxCalls: generator.MAX_REJECTIONS + 1 });
  assert.throws(() => generator.getRandomIndex(n, source), (error) => error.code === "RANDOM_EXHAUSTED");
  assert.equal(source.getCallCount(), generator.MAX_REJECTIONS);
});

test("[N-03] U-16 シャッフルが Fisher–Yates(既知の乱数列で期待どおりの並び)", () => {
  // i=3: 1%4=1 → [a,d,c,b] / i=2: 0%3=0 → [c,d,a,b] / i=1: 1%2=1 → そのまま
  const source = createSequenceSource([1, 0, 1], { maxCalls: 3 });
  assert.deepEqual(generator.shuffleInPlace(["a", "b", "c", "d"], source), ["c", "d", "a", "b"]);
  assert.equal(source.getCallCount(), 3);

  // i=4: 0 → [e,b,c,d,a] / i=3: 2 → [e,b,d,c,a] / i=2: 1 → [e,d,b,c,a] / i=1: 0 → [d,e,b,c,a]
  const second = createSequenceSource([0, 2, 1, 0], { maxCalls: 4 });
  assert.deepEqual(generator.shuffleInPlace(["a", "b", "c", "d", "e"], second), ["d", "e", "b", "c", "a"]);
});

test("[N-03] U-17 シャッフル後も文字種の保証が維持される(既知の乱数列)", () => {
  // 保証分: B(1%2), a(0%2), 1(1%2) / 残り: "ABab01"[4%6]="0" → [B,a,1,0]
  // シャッフル: i=3: 0%4=0 → [0,a,1,B] / i=2: 2%3=2 / i=1: 1%2=1 → "0a1B"
  const groups = ["AB", "ab", "01"];
  const source = createSequenceSource([1, 0, 1, 4, 0, 2, 1], { maxCalls: 7 });
  const password = generator.composePassword(groups, 4, source);
  assert.equal(password, "0a1B");
  for (const group of groups) {
    assert.ok([...password].some((character) => group.includes(character)), `${group} を含む`);
  }
});
