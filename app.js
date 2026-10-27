/**
 * 画面の操作(入力の取得、表示、コピー、設定の保存)。生成ロジックは passwordGenerator.js にある。
 */
(function _startApp() {
  "use strict";

  const generator = globalThis.PasswordGenerator;
  const STORAGE_KEY = "passwordGenerator.settings.v1";
  const MESSAGES = Object.freeze({
    copySucceeded: "コピーしました",
    copyFailed: "コピーできませんでした。パスワードを選択したので、手動でコピーしてください。",
    copyUnavailable: "コピーするパスワードがありません。",
    maskOn: "伏せ字にする",
    maskOff: "表示する",
  });

  const elements = {
    password: document.getElementById("password"),
    copyButton: document.getElementById("copy-button"),
    visibilityButton: document.getElementById("visibility-button"),
    copyStatus: document.getElementById("copy-status"),
    strengthMeter: document.getElementById("strength-meter"),
    strengthLabel: document.getElementById("strength-label"),
    strengthBits: document.getElementById("strength-bits"),
    regenerateButton: document.getElementById("regenerate-button"),
    errorMessage: document.getElementById("error-message"),
    lengthRange: document.getElementById("length-range"),
    lengthInput: document.getElementById("length-input"),
    hasUppercase: document.getElementById("has-uppercase"),
    hasLowercase: document.getElementById("has-lowercase"),
    hasDigits: document.getElementById("has-digits"),
    hasSymbols: document.getElementById("has-symbols"),
    isAmbiguousExcluded: document.getElementById("is-ambiguous-excluded"),
    symbols: document.getElementById("symbols"),
  };
  const TYPE_KEYS = Object.freeze(["hasUppercase", "hasLowercase", "hasDigits", "hasSymbols"]);

  // 生成済みパスワード・表示・コピー対象・強度表示は、常にこの1件に対応させる
  const state = {
    password: "",
    strength: null,
    isMasked: false,
  };
  // 入力欄ごとのエラー。複数あるときはまとめて表示する
  const errors = new Map();

  function _setError(source, message) {
    if (message) {
      errors.set(source, message);
    } else {
      errors.delete(source);
    }
    elements.errorMessage.textContent = [...errors.values()].join("\n");
  }

  function _loadSettings() {
    try {
      return generator.parseStoredSettings(globalThis.localStorage.getItem(STORAGE_KEY));
    } catch {
      return generator.getDefaultSettings();
    }
  }

  function _saveSettings(settings) {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, generator.serializeSettings(settings));
    } catch {
      // NOTE: 保存できない環境(プライベートモード等)でも、生成は続けられるようにする
    }
  }

  function _applySettingsToForm(settings) {
    elements.lengthInput.value = String(settings.length);
    elements.lengthRange.value = String(settings.length);
    for (const key of [...TYPE_KEYS, "isAmbiguousExcluded"]) {
      elements[key].checked = settings[key];
    }
    elements.symbols.value = settings.symbols;
  }

  function _readFormSettings() {
    return {
      length: elements.lengthInput.value,
      hasUppercase: elements.hasUppercase.checked,
      hasLowercase: elements.hasLowercase.checked,
      hasDigits: elements.hasDigits.checked,
      hasSymbols: elements.hasSymbols.checked,
      isAmbiguousExcluded: elements.isAmbiguousExcluded.checked,
      symbols: elements.symbols.value,
    };
  }

  /**
   * 画面の入力を検証し、妥当なら数値化・重複除去した設定を返す。不正なら null。
   * @returns {object | null}
   */
  function _validateForm() {
    const formSettings = _readFormSettings();
    const lengthResult = generator.validateLength(formSettings.length);
    _setError("length", lengthResult.isValid ? "" : lengthResult.message);
    const symbolsResult = generator.validateSymbols(formSettings.symbols);
    _setError("symbols", symbolsResult.isValid ? "" : symbolsResult.message);
    if (!lengthResult.isValid || !symbolsResult.isValid) {
      return null;
    }
    const settings = { ...formSettings, length: lengthResult.value, symbols: symbolsResult.value };
    return _hasUsableGroups(settings) ? settings : null;
  }

  function _hasUsableGroups(settings) {
    try {
      generator.buildCharacterGroups(settings);
      _setError("groups", "");
      return true;
    } catch (error) {
      if (!(error instanceof generator.PasswordGeneratorError)) {
        throw error;
      }
      _setError("groups", error.message);
      return false;
    }
  }

  function _saveIfValid() {
    const settings = _validateForm();
    if (settings && generator.isValidSettings(settings)) {
      _saveSettings(settings);
    }
    return settings;
  }

  function _renderPassword() {
    elements.password.value = state.password;
    elements.password.type = state.isMasked ? "password" : "text";
    elements.visibilityButton.textContent = state.isMasked ? MESSAGES.maskOff : MESSAGES.maskOn;
    elements.visibilityButton.setAttribute("aria-pressed", String(state.isMasked));
    elements.copyButton.disabled = state.password === "";
  }

  function _renderStrength() {
    if (!state.strength) {
      elements.strengthMeter.value = 0;
      elements.strengthLabel.textContent = "";
      elements.strengthBits.textContent = "";
      return;
    }
    elements.strengthMeter.value = state.strength.level.rank;
    elements.strengthLabel.textContent = state.strength.level.label;
    elements.strengthBits.textContent = `(約${Math.round(state.strength.bits)} bit)`;
  }

  function _setCopyStatus(message, isFailure) {
    elements.copyStatus.textContent = message;
    elements.copyStatus.classList.toggle("is-failure", isFailure);
  }

  function _showGenerationResult(password, strength) {
    state.password = password;
    state.strength = strength;
    _setCopyStatus("", false);
    _renderPassword();
    _renderStrength();
  }

  /**
   * 画面の設定でパスワードを生成する。入力エラーなら表示中のパスワードを残し、
   * 乱数のエラーなら古いパスワードと誤認させないために消す。
   */
  function regenerate() {
    const settings = _saveIfValid();
    if (!settings) {
      return;
    }
    try {
      const password = generator.generatePassword(settings);
      _setError("generation", "");
      _showGenerationResult(password, generator.calculateStrength(settings));
    } catch (error) {
      if (!(error instanceof generator.PasswordGeneratorError)) {
        throw error;
      }
      _setError("generation", error.message);
      if (error.isRandomError) {
        _showGenerationResult("", null);
      }
    }
  }

  function _commitLength() {
    const result = generator.validateLength(elements.lengthInput.value);
    _setError("length", result.isValid ? "" : result.message);
    if (result.isValid) {
      elements.lengthInput.value = String(result.value);
      elements.lengthRange.value = String(result.value);
      _saveIfValid();
    }
  }

  function _handleLengthInput() {
    // 入力途中(空欄や桁の途中)はエラーにせず、妥当な値のときだけスライダーに反映する
    const result = generator.validateLength(elements.lengthInput.value);
    if (result.isValid) {
      elements.lengthRange.value = String(result.value);
      _setError("length", "");
      _saveIfValid();
    }
  }

  function _handleLengthRange() {
    elements.lengthInput.value = elements.lengthRange.value;
    _setError("length", "");
    _saveIfValid();
  }

  function _handleTypeChange(event) {
    const hasAnyType = TYPE_KEYS.some((key) => elements[key].checked);
    if (!hasAnyType) {
      // 全部OFFにはできないので、外したチェックを戻す
      event.target.checked = true;
      _setError("types", generator.ERROR_MESSAGES.NO_CHARACTER_TYPE);
      return;
    }
    _setError("types", "");
    _saveIfValid();
  }

  function _handleSymbolsInput() {
    const result = generator.validateSymbols(elements.symbols.value);
    _setError("symbols", result.isValid ? "" : result.message);
    if (result.isValid) {
      _saveIfValid();
    }
  }

  function _handleSymbolsChange() {
    const result = generator.validateSymbols(elements.symbols.value);
    if (result.isValid) {
      elements.symbols.value = result.value;
    }
    _handleSymbolsInput();
  }

  function _selectPasswordForManualCopy() {
    if (state.isMasked) {
      // 伏せ字のままでは手動でコピーできないため、表示に戻してから選択する
      state.isMasked = false;
      _renderPassword();
    }
    try {
      elements.password.focus();
      elements.password.select();
      elements.password.setSelectionRange(0, state.password.length);
    } catch {
      // NOTE: 自動選択に失敗しても、入力欄は readonly なので手動で選択できる
    }
  }

  async function copyPassword() {
    if (state.password === "") {
      _setCopyStatus(MESSAGES.copyUnavailable, true);
      return;
    }
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("Clipboard API is unavailable");
      }
      await navigator.clipboard.writeText(state.password);
      _setCopyStatus(MESSAGES.copySucceeded, false);
    } catch {
      _setCopyStatus(MESSAGES.copyFailed, true);
      _selectPasswordForManualCopy();
    }
  }

  function toggleMask() {
    state.isMasked = !state.isMasked;
    _renderPassword();
  }

  function _bindEvents() {
    elements.regenerateButton.addEventListener("click", regenerate);
    elements.copyButton.addEventListener("click", copyPassword);
    elements.visibilityButton.addEventListener("click", toggleMask);
    elements.lengthRange.addEventListener("input", _handleLengthRange);
    elements.lengthInput.addEventListener("input", _handleLengthInput);
    elements.lengthInput.addEventListener("change", _commitLength);
    elements.lengthInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        _commitLength();
      }
    });
    for (const key of TYPE_KEYS) {
      elements[key].addEventListener("change", _handleTypeChange);
    }
    elements.isAmbiguousExcluded.addEventListener("change", _saveIfValid);
    elements.symbols.addEventListener("input", _handleSymbolsInput);
    elements.symbols.addEventListener("change", _handleSymbolsChange);
  }

  function _initialize() {
    elements.lengthRange.min = String(generator.MIN_LENGTH);
    elements.lengthRange.max = String(generator.MAX_LENGTH);
    _applySettingsToForm(_loadSettings());
    _bindEvents();
    _renderPassword();
    regenerate();
  }

  _initialize();
})();
