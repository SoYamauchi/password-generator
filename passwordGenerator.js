/**
 * パスワード生成ロジック(DOM に依存しない)。
 *
 * ブラウザでは classic script として読み込み、Node では require で読み込める。
 * 乱数源は crypto.getRandomValues だけを使い、使えない場合は代替せずにエラーにする。
 */
(function _definePasswordGenerator() {
  "use strict";

  const MIN_LENGTH = 8;
  const MAX_LENGTH = 128;
  const DEFAULT_LENGTH = 24;
  const UINT32_RANGE = 2 ** 32;
  // NOTE: 1回の棄却確率は 1/2 未満なので、この回数に達するのは乱数源の故障時だけ
  const MAX_REJECTIONS = 1000;

  const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
  const DIGITS = "0123456789";
  const DEFAULT_SYMBOLS = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
  const AMBIGUOUS_CHARACTERS = "0O1lI";

  // 強度の段階の閾値(暫定値)。bit 数の大きい順に並べる
  const STRENGTH_LEVELS = Object.freeze([
    Object.freeze({ minBits: 112, rank: 4, label: "非常に強い" }),
    Object.freeze({ minBits: 80, rank: 3, label: "強い" }),
    Object.freeze({ minBits: 50, rank: 2, label: "普通" }),
    Object.freeze({ minBits: 0, rank: 1, label: "弱い" }),
  ]);

  const DEFAULT_SETTINGS = Object.freeze({
    length: DEFAULT_LENGTH,
    hasUppercase: true,
    hasLowercase: true,
    hasDigits: true,
    hasSymbols: true,
    isAmbiguousExcluded: false,
    symbols: DEFAULT_SYMBOLS,
  });
  const SETTINGS_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS));
  const BOOLEAN_SETTINGS_KEYS = Object.freeze([
    "hasUppercase",
    "hasLowercase",
    "hasDigits",
    "hasSymbols",
    "isAmbiguousExcluded",
  ]);

  const ERROR_MESSAGES = Object.freeze({
    LENGTH_EMPTY: "長さを入力してください。",
    LENGTH_NOT_INTEGER: "長さは整数で入力してください。",
    LENGTH_OUT_OF_RANGE: `長さは${MIN_LENGTH}〜${MAX_LENGTH}の範囲で入力してください。`,
    NO_CHARACTER_TYPE: "文字種を1つ以上選んでください。",
    TOO_MANY_CHARACTER_TYPES: "有効な文字種の数が、長さを超えています。",
    SYMBOLS_INVALID:
      "使う記号には、ASCIIの記号だけを入力できます(空白・全角・絵文字・英数字は使えません)。",
    SYMBOLS_EMPTY: "記号がONのときは、使う記号を1種類以上入力してください。",
    CHARACTER_TYPE_EMPTY: "紛らわしい文字を除外すると、使える文字がなくなる文字種があります。",
    RANDOM_UNAVAILABLE: "安全な乱数(crypto.getRandomValues)が使えないため、生成できません。",
    RANDOM_EXHAUSTED: "乱数の取得に失敗したため、生成できません。",
  });
  const RANDOM_ERROR_CODES = Object.freeze(["RANDOM_UNAVAILABLE", "RANDOM_EXHAUSTED"]);

  class PasswordGeneratorError extends Error {
    /**
     * @param {string} code ERROR_MESSAGES のキー
     */
    constructor(code) {
      super(ERROR_MESSAGES[code]);
      this.name = "PasswordGeneratorError";
      this.code = code;
      this.isRandomError = RANDOM_ERROR_CODES.includes(code);
    }
  }

  function _createFailure(code) {
    return { isValid: false, code, message: ERROR_MESSAGES[code] };
  }

  /**
   * 長さの入力値を検証する。文字列(画面の入力)と数値の両方を受け付ける。
   * @param {unknown} value
   * @returns {{isValid: true, value: number} | {isValid: false, code: string, message: string}}
   */
  function validateLength(value) {
    if (value === null || value === undefined) {
      return _createFailure("LENGTH_EMPTY");
    }
    if (typeof value === "string") {
      return _validateLengthText(value);
    }
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return _createFailure("LENGTH_NOT_INTEGER");
    }
    if (value < MIN_LENGTH || value > MAX_LENGTH) {
      return _createFailure("LENGTH_OUT_OF_RANGE");
    }
    return { isValid: true, value };
  }

  function _validateLengthText(text) {
    const trimmed = text.trim();
    if (trimmed === "") {
      return _createFailure("LENGTH_EMPTY");
    }
    if (!/^-?[0-9]+$/.test(trimmed)) {
      return _createFailure("LENGTH_NOT_INTEGER");
    }
    return validateLength(Number(trimmed));
  }

  /**
   * 使う記号の入力値を検証し、重複を除いた記号列を返す。空文字列も有効とする。
   * @param {unknown} text
   * @returns {{isValid: true, value: string} | {isValid: false, code: string, message: string}}
   */
  function validateSymbols(text) {
    if (typeof text !== "string") {
      return _createFailure("SYMBOLS_INVALID");
    }
    const uniqueSymbols = [];
    // for...of はコードポイント単位で回るため、絵文字も1文字として判定できる
    for (const character of text) {
      if (!DEFAULT_SYMBOLS.includes(character)) {
        return _createFailure("SYMBOLS_INVALID");
      }
      if (!uniqueSymbols.includes(character)) {
        uniqueSymbols.push(character);
      }
    }
    return { isValid: true, value: uniqueSymbols.join("") };
  }

  function _requireSymbols(symbols) {
    const result = validateSymbols(symbols);
    if (!result.isValid) {
      throw new PasswordGeneratorError(result.code);
    }
    if (result.value === "") {
      throw new PasswordGeneratorError("SYMBOLS_EMPTY");
    }
    return result.value;
  }

  function _removeAmbiguous(group) {
    return [...group].filter((character) => !AMBIGUOUS_CHARACTERS.includes(character)).join("");
  }

  /**
   * 有効な文字種ごとの文字集合を返す。除外設定と記号の重複除去を反映する。
   * @param {object} options 設定(DEFAULT_SETTINGS と同じ形)
   * @returns {string[]} 文字種ごとの文字列(互いに素)
   */
  function buildCharacterGroups(options) {
    const groups = [];
    if (options.hasUppercase) {
      groups.push(UPPERCASE);
    }
    if (options.hasLowercase) {
      groups.push(LOWERCASE);
    }
    if (options.hasDigits) {
      groups.push(DIGITS);
    }
    if (options.hasSymbols) {
      groups.push(_requireSymbols(options.symbols));
    }
    if (groups.length === 0) {
      throw new PasswordGeneratorError("NO_CHARACTER_TYPE");
    }
    const filtered = options.isAmbiguousExcluded ? groups.map(_removeAmbiguous) : groups;
    if (filtered.some((group) => group === "")) {
      throw new PasswordGeneratorError("CHARACTER_TYPE_EMPTY");
    }
    return filtered;
  }

  function _requireLength(length) {
    const result = validateLength(length);
    if (!result.isValid) {
      throw new PasswordGeneratorError(result.code);
    }
    return result.value;
  }

  function _resolveRandomSource(randomSource) {
    if (randomSource !== undefined) {
      if (typeof randomSource !== "function") {
        throw new PasswordGeneratorError("RANDOM_UNAVAILABLE");
      }
      return randomSource;
    }
    const cryptoObject = globalThis.crypto;
    if (!cryptoObject || typeof cryptoObject.getRandomValues !== "function") {
      throw new PasswordGeneratorError("RANDOM_UNAVAILABLE");
    }
    return (array) => cryptoObject.getRandomValues(array);
  }

  /**
   * 0 以上 n 未満の一様な整数を、棄却サンプリングで選ぶ(モジュロバイアスなし)。
   * @param {number} n 選択肢の数(1 以上 2^32 以下の整数)
   * @param {(array: Uint32Array) => void} randomSource getRandomValues と同じ形の関数
   * @returns {number}
   */
  function getRandomIndex(n, randomSource) {
    if (!Number.isInteger(n) || n < 1 || n > UINT32_RANGE) {
      throw new RangeError(`n must be an integer from 1 to 2^32: ${n}`);
    }
    // limit 以上の値を採用すると、小さい添字が選ばれやすくなるため捨てる
    const limit = Math.floor(UINT32_RANGE / n) * n;
    const buffer = new Uint32Array(1);
    for (let attempt = 0; attempt < MAX_REJECTIONS; attempt += 1) {
      randomSource(buffer);
      const value = buffer[0];
      if (value < limit) {
        return value % n;
      }
    }
    throw new PasswordGeneratorError("RANDOM_EXHAUSTED");
  }

  /**
   * 配列を Fisher–Yates 法でその場で並べ替える。添字は getRandomIndex で選ぶ。
   * @template T
   * @param {T[]} items
   * @param {(array: Uint32Array) => void} randomSource
   * @returns {T[]} 並べ替えた同じ配列
   */
  function shuffleInPlace(items, randomSource) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = getRandomIndex(index + 1, randomSource);
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  function _pickCharacter(pool, randomSource) {
    return pool[getRandomIndex(pool.length, randomSource)];
  }

  /**
   * 文字種ごとに1文字ずつ選び、残りを全体から選んでから並べ替える。
   * @param {string[]} groups 互いに素な文字種ごとの文字列
   * @param {number} length 生成する長さ
   * @param {(array: Uint32Array) => void} randomSource
   * @returns {string}
   */
  function composePassword(groups, length, randomSource) {
    // 不変条件: 各文字種から1文字ずつ入れるので、文字種の数は長さ以下でなければならない
    if (groups.length > length) {
      throw new PasswordGeneratorError("TOO_MANY_CHARACTER_TYPES");
    }
    const allCharacters = groups.join("");
    const characters = groups.map((group) => _pickCharacter(group, randomSource));
    while (characters.length < length) {
      characters.push(_pickCharacter(allCharacters, randomSource));
    }
    return shuffleInPlace(characters, randomSource).join("");
  }

  /**
   * 設定に従ってパスワードを生成する。
   * @param {object} options 設定(DEFAULT_SETTINGS と同じ形)
   * @param {(array: Uint32Array) => void} [randomSource] 既定は crypto.getRandomValues
   * @returns {string}
   */
  function generatePassword(options, randomSource) {
    const length = _requireLength(options.length);
    const groups = buildCharacterGroups(options);
    const source = _resolveRandomSource(randomSource);
    return composePassword(groups, length, source);
  }

  /**
   * 段階の閾値表から、bit 数に対応する段階を返す。
   * @param {number} bits
   * @returns {{minBits: number, rank: number, label: string}}
   */
  function getStrengthLevel(bits) {
    return STRENGTH_LEVELS.find((level) => bits >= level.minBits);
  }

  /**
   * 文字集合に基づく強度の概算 L × log2(N) を返す。
   * NOTE: 文字種の保証による偏りは反映しないため、実際のエントロピーはこの値以下になる。
   * @param {object} options 設定(DEFAULT_SETTINGS と同じ形)
   * @returns {{charsetSize: number, bits: number, level: {minBits: number, rank: number, label: string}}}
   */
  function calculateStrength(options) {
    const length = _requireLength(options.length);
    const charsetSize = buildCharacterGroups(options).join("").length;
    const bits = length * Math.log2(charsetSize);
    return { charsetSize, bits, level: getStrengthLevel(bits) };
  }

  /**
   * 初期設定のコピーを返す。
   * @returns {object}
   */
  function getDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  function _hasExactlySettingsKeys(candidate) {
    const keys = Object.keys(candidate);
    return keys.length === SETTINGS_KEYS.length && keys.every((key) => SETTINGS_KEYS.includes(key));
  }

  function _canBuildGroups(settings) {
    try {
      buildCharacterGroups(settings);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 設定値として妥当かを検証する(保存値の読み込みで使う)。
   * @param {unknown} candidate
   * @returns {boolean}
   */
  function isValidSettings(candidate) {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      return false;
    }
    if (!_hasExactlySettingsKeys(candidate)) {
      return false;
    }
    if (typeof candidate.length !== "number" || !validateLength(candidate.length).isValid) {
      return false;
    }
    if (!BOOLEAN_SETTINGS_KEYS.every((key) => typeof candidate[key] === "boolean")) {
      return false;
    }
    return validateSymbols(candidate.symbols).isValid && _canBuildGroups(candidate);
  }

  /**
   * 保存された文字列から設定を復元する。不正なら初期設定を返す。
   * @param {string | null} rawText
   * @returns {object}
   */
  function parseStoredSettings(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return getDefaultSettings();
    }
    if (!isValidSettings(parsed)) {
      return getDefaultSettings();
    }
    return { ...parsed, symbols: validateSymbols(parsed.symbols).value };
  }

  /**
   * 設定だけを保存用の文字列にする(パスワードは含めない)。
   * @param {object} settings
   * @returns {string}
   */
  function serializeSettings(settings) {
    const picked = {};
    for (const key of SETTINGS_KEYS) {
      picked[key] = settings[key];
    }
    return JSON.stringify(picked);
  }

  const api = Object.freeze({
    MIN_LENGTH,
    MAX_LENGTH,
    DEFAULT_LENGTH,
    UPPERCASE,
    LOWERCASE,
    DIGITS,
    DEFAULT_SYMBOLS,
    AMBIGUOUS_CHARACTERS,
    STRENGTH_LEVELS,
    MAX_REJECTIONS,
    ERROR_MESSAGES,
    PasswordGeneratorError,
    validateLength,
    validateSymbols,
    buildCharacterGroups,
    getRandomIndex,
    shuffleInPlace,
    composePassword,
    generatePassword,
    getStrengthLevel,
    calculateStrength,
    getDefaultSettings,
    isValidSettings,
    parseStoredSettings,
    serializeSettings,
  });

  globalThis.PasswordGenerator = api;
  if (typeof module !== "undefined") {
    module.exports = api;
  }
})();
