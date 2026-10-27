"use strict";

const js = require("@eslint/js");

const MAX_LINE_LENGTH = 120;
const MAX_FUNCTION_LINES = 30;
const MAX_NESTING_DEPTH = 4;

const BROWSER_GLOBALS = Object.freeze({
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  globalThis: "readonly",
  console: "readonly",
  module: "readonly",
});

const NODE_GLOBALS = Object.freeze({
  require: "readonly",
  module: "writable",
  process: "readonly",
  console: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  globalThis: "readonly",
  URL: "readonly",
  fetch: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  Buffer: "readonly",
});

// 危険なAPIと、暗号論的でない乱数の使用を禁止する
const SECURITY_RULES = Object.freeze({
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-restricted-properties": [
    "error",
    { object: "Math", property: "random", message: "乱数は crypto.getRandomValues だけを使う" },
    { object: "document", property: "write", message: "document.write は使わない" },
    { object: "document", property: "writeln", message: "document.writeln は使わない" },
    { property: "innerHTML", message: "表示は textContent で行う" },
    { property: "outerHTML", message: "表示は textContent で行う" },
    { property: "insertAdjacentHTML", message: "表示は textContent で行う" },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector: "MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]",
      message: "表示は textContent で行う",
    },
    {
      selector: "MemberExpression[object.name='Math'][property.name='random']",
      message: "乱数は crypto.getRandomValues だけを使う",
    },
  ],
});

const STYLE_RULES = Object.freeze({
  "no-var": "error",
  "prefer-const": "error",
  "prefer-template": "error",
  "eqeqeq": "error",
  "curly": "error",
  "indent": ["error", 2, { SwitchCase: 1 }],
  "no-tabs": "error",
  "brace-style": ["error", "1tbs"],
  "comma-dangle": ["error", "always-multiline"],
  "max-len": ["error", { code: MAX_LINE_LENGTH, ignoreUrls: true }],
  "max-depth": ["error", MAX_NESTING_DEPTH],
  "max-lines-per-function": [
    "error",
    { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true, IIFEs: false },
  ],
});

module.exports = [
  { ignores: ["node_modules/**", "evidence/**", ".mutation-tmp/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: NODE_GLOBALS },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: { ...SECURITY_RULES, ...STYLE_RULES },
  },
  {
    files: ["passwordGenerator.js", "app.js"],
    languageOptions: { sourceType: "script", globals: BROWSER_GLOBALS },
  },
];
