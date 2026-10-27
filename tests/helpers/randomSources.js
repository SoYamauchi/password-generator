"use strict";

const DEFAULT_MAX_CALLS = 10000;
const XORSHIFT_SHIFT_A = 13;
const XORSHIFT_SHIFT_B = 17;
const XORSHIFT_SHIFT_C = 5;

/**
 * 決めた値の列を順に返すダミーの乱数源。列を使い切るか上限回数に達したら例外を投げるので、
 * 棄却が終わらないテストにはならない。
 * @param {number[]} values 32bit 符号なし整数の列
 * @param {{maxCalls?: number}} [options]
 * @returns {((array: Uint32Array) => void) & {getCallCount: () => number}}
 */
function createSequenceSource(values, options = {}) {
  const maxCalls = options.maxCalls || DEFAULT_MAX_CALLS;
  let position = 0;
  let callCount = 0;
  const source = (array) => {
    callCount += 1;
    if (callCount > maxCalls) {
      throw new Error(`dummy random source exceeded ${maxCalls} calls`);
    }
    for (let index = 0; index < array.length; index += 1) {
      if (position >= values.length) {
        throw new Error("dummy random source is exhausted");
      }
      array[index] = values[position];
      position += 1;
    }
    return array;
  };
  source.getCallCount = () => callCount;
  return source;
}

/**
 * 単体テストを再現可能にするための、シード付きの決定的な擬似乱数源(xorshift32)。
 * NOTE: テスト専用。アプリ本体では使わない。
 * @param {number} seed 0 以外の整数
 * @returns {(array: Uint32Array) => void}
 */
function createXorshiftSource(seed) {
  let state = seed >>> 0 || 1;
  return (array) => {
    for (let index = 0; index < array.length; index += 1) {
      state ^= state << XORSHIFT_SHIFT_A;
      state >>>= 0;
      state ^= state >>> XORSHIFT_SHIFT_B;
      state ^= state << XORSHIFT_SHIFT_C;
      state >>>= 0;
      array[index] = state;
    }
    return array;
  };
}

module.exports = { createSequenceSource, createXorshiftSource };
