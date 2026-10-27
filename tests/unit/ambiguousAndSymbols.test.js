"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGenerator } = require("../helpers/appModule.js");
const { createXorshiftSource } = require("../helpers/randomSources.js");

const generator = loadGenerator();
const SEED = 777;
const SAMPLE_COUNT = 2000;
const LONG_LENGTH = 128;

function _collectCharacters(settings, count) {
  const randomSource = createXorshiftSource(SEED);
  const seen = new Set();
  for (let i = 0; i < count; i += 1) {
    for (const character of generator.generatePassword(settings, randomSource)) {
      seen.add(character);
    }
  }
  return seen;
}

test("[F-04] U-06 除外ONのとき 0 O 1 l I が1文字も出ない", () => {
  const settings = { ...generator.getDefaultSettings(), length: LONG_LENGTH, isAmbiguousExcluded: true };
  const seen = _collectCharacters(settings, SAMPLE_COUNT);
  for (const character of generator.AMBIGUOUS_CHARACTERS) {
    assert.equal(seen.has(character), false, `${character} が出てはいけない`);
  }
});

test("[F-04] U-07 除外OFFのとき 0 O 1 l I が出るようになる", () => {
  const settings = { ...generator.getDefaultSettings(), length: LONG_LENGTH, isAmbiguousExcluded: false };
  const seen = _collectCharacters(settings, SAMPLE_COUNT);
  for (const character of generator.AMBIGUOUS_CHARACTERS) {
    assert.equal(seen.has(character), true, `${character} が出るはず`);
  }
});

test("[F-05] U-08 指定した記号以外の記号が出ない", () => {
  const symbols = "#$%";
  const settings = { ...generator.getDefaultSettings(), length: LONG_LENGTH, symbols };
  const seen = _collectCharacters(settings, SAMPLE_COUNT);
  const usedSymbols = [...seen].filter((character) => generator.DEFAULT_SYMBOLS.includes(character));
  assert.deepEqual(usedSymbols.sort(), [...symbols].sort());
});

test("[F-05] U-09 使う記号の重複は除去される", () => {
  assert.equal(generator.validateSymbols("!!##!@").value, "!#@");
  const settings = { ...generator.getDefaultSettings(), symbols: "!!##!@" };
  const groups = generator.buildCharacterGroups(settings);
  assert.equal(groups[groups.length - 1], "!#@");
  assert.equal(generator.validateSymbols(generator.DEFAULT_SYMBOLS).value.length, 32);
});

test("[F-05] U-10 空白・全角・絵文字・英数字は拒否される", () => {
  // \uFF01 は全角の感嘆符、\u3000 は全角空白、\uFF21 は全角の A
  const invalidInputs = [" ", "! ", "\t", "\uFF01", "\u3000", "\uFF21", "a", "Z", "5", "\u{1F600}", "!\u{1F600}"];
  for (const input of invalidInputs) {
    assert.equal(generator.validateSymbols(input).isValid, false, `${JSON.stringify(input)} は拒否`);
    const settings = { ...generator.getDefaultSettings(), symbols: input };
    assert.throws(
      () => generator.generatePassword(settings, createXorshiftSource(SEED)),
      (error) => error.code === "SYMBOLS_INVALID",
    );
  }
  assert.equal(generator.validateSymbols("<script>").isValid, false);
});

test("[F-05] U-11 記号がONで0種類のときはエラーになる", () => {
  const settings = { ...generator.getDefaultSettings(), symbols: "" };
  assert.equal(generator.validateSymbols("").isValid, true);
  assert.throws(
    () => generator.generatePassword(settings, createXorshiftSource(SEED)),
    (error) => error.code === "SYMBOLS_EMPTY",
  );
});

test("[F-05] U-12 記号がOFFのときは、記号欄の内容(不正な値や空欄でも)を使わない", () => {
  for (const symbols of ["abc😀", "", "#"]) {
    const settings = { ...generator.getDefaultSettings(), hasSymbols: false, symbols, length: LONG_LENGTH };
    const seen = _collectCharacters(settings, SAMPLE_COUNT / 10);
    const usedSymbols = [...seen].filter((character) => generator.DEFAULT_SYMBOLS.includes(character));
    assert.deepEqual(usedSymbols, [], `記号欄 ${JSON.stringify(symbols)} は使われない`);
  }
});
