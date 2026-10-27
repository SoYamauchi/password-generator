"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGenerator } = require("../helpers/appModule.js");
const { createXorshiftSource } = require("../helpers/randomSources.js");

const generator = loadGenerator();
const SEED = 4242;
const SAMPLES_PER_COMBINATION = 300;
const SHORT_LENGTH = 8;
const TYPE_DEFINITIONS = Object.freeze([
  { key: "hasUppercase", characters: generator.UPPERCASE },
  { key: "hasLowercase", characters: generator.LOWERCASE },
  { key: "hasDigits", characters: generator.DIGITS },
  { key: "hasSymbols", characters: generator.DEFAULT_SYMBOLS },
]);
const COMBINATION_COUNT = 2 ** TYPE_DEFINITIONS.length;

function _createSettings(mask) {
  const settings = { ...generator.getDefaultSettings(), length: SHORT_LENGTH };
  TYPE_DEFINITIONS.forEach(({ key }, index) => {
    settings[key] = (mask & (1 << index)) !== 0;
  });
  return settings;
}

function _assertPasswordMatchesTypes(password, settings, label) {
  const enabled = TYPE_DEFINITIONS.filter(({ key }) => settings[key]);
  const allowed = enabled.map(({ characters }) => characters).join("");
  for (const character of password) {
    assert.ok(allowed.includes(character), `${label}: 有効でない文字種の文字が含まれる`);
  }
  for (const { key, characters } of enabled) {
    const hasType = [...password].some((character) => characters.includes(character));
    assert.ok(hasType, `${label}: ${key} の文字が1文字もない`);
  }
}

test("[F-02][F-03] U-03 文字種のON/OFF全15通りで、ONの文字種だけが使われ、それぞれ1文字以上含まれる", () => {
  const randomSource = createXorshiftSource(SEED);
  let checkedCombinations = 0;
  for (let mask = 1; mask < COMBINATION_COUNT; mask += 1) {
    const settings = _createSettings(mask);
    for (let sample = 0; sample < SAMPLES_PER_COMBINATION; sample += 1) {
      const password = generator.generatePassword(settings, randomSource);
      _assertPasswordMatchesTypes(password, settings, `組み合わせ ${mask.toString(2)}`);
    }
    checkedCombinations += 1;
  }
  assert.equal(checkedCombinations, COMBINATION_COUNT - 1);
});

test("[F-02] U-04 文字種が全部OFFのときはエラーになる", () => {
  const settings = _createSettings(0);
  assert.throws(
    () => generator.generatePassword(settings, createXorshiftSource(SEED)),
    (error) => error.code === "NO_CHARACTER_TYPE",
  );
});

test("[F-02] U-05 有効な文字種の数が長さを超える設定は拒否される(composePassword を直接呼ぶ)", () => {
  const groups = TYPE_DEFINITIONS.map(({ characters }) => characters);
  const tooShortLength = groups.length - 1;
  assert.throws(
    () => generator.composePassword(groups, tooShortLength, createXorshiftSource(SEED)),
    (error) => error.code === "TOO_MANY_CHARACTER_TYPES",
  );
  const password = generator.composePassword(groups, groups.length, createXorshiftSource(SEED));
  assert.equal(password.length, groups.length);
});
