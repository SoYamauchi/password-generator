"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit, devices } = require("playwright");
const { startServer } = require("../../scripts/serve.js");

const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");
const EVIDENCE_DIRECTORY = process.env.EVIDENCE_DIR
  ? path.resolve(process.env.EVIDENCE_DIR)
  : path.join(REPOSITORY_ROOT, "evidence");
const SCREENSHOT_DIRECTORY = path.join(EVIDENCE_DIRECTORY, "screenshots");
const DESKTOP_VIEWPORT = Object.freeze({ width: 1280, height: 900 });
const MOBILE_VIEWPORT = Object.freeze({ width: 375, height: 812 });
const PASSWORD_WAIT_MILLISECONDS = 5000;

const BROWSER_PROFILES = Object.freeze([
  {
    name: "chromium-desktop",
    browserType: chromium,
    contextOptions: { viewport: DESKTOP_VIEWPORT },
    canReadClipboard: true,
  },
  {
    name: "webkit-iphone",
    browserType: webkit,
    contextOptions: { ...devices["iPhone 13"], viewport: MOBILE_VIEWPORT },
    canReadClipboard: false,
  },
]);

const SELECTORS = Object.freeze({
  password: "#password",
  copyButton: "#copy-button",
  visibilityButton: "#visibility-button",
  copyStatus: "#copy-status",
  strengthLabel: "#strength-label",
  strengthBits: "#strength-bits",
  regenerateButton: "#regenerate-button",
  errorMessage: "#error-message",
  lengthRange: "#length-range",
  lengthInput: "#length-input",
  hasUppercase: "#has-uppercase",
  hasLowercase: "#has-lowercase",
  hasDigits: "#has-digits",
  hasSymbols: "#has-symbols",
  isAmbiguousExcluded: "#is-ambiguous-excluded",
  symbols: "#symbols",
});

/**
 * 記録したリクエストやエラーを、テスト全体で集める。
 */
const records = {
  requests: [],
  pageErrors: [],
  consoleMessages: [],
};

/**
 * テスト対象のURLを用意する。BASE_URL があればそれを使い、なければローカルサーバーを起動する。
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>}>}
 */
async function prepareBaseUrl() {
  if (process.env.BASE_URL) {
    return { baseUrl: process.env.BASE_URL, close: async () => {} };
  }
  const { server, url } = await startServer({ port: 0 });
  return { baseUrl: url, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

function _attachRecorders(page, profileName) {
  page.on("request", (request) => {
    records.requests.push({ browser: profileName, method: request.method(), url: request.url(),
      resourceType: request.resourceType() });
  });
  page.on("pageerror", (error) => {
    records.pageErrors.push({ browser: profileName, message: error.message });
  });
  page.on("console", (message) => {
    records.consoleMessages.push({ browser: profileName, type: message.type(), text: message.text() });
  });
  page.dialogs = [];
  page.on("dialog", async (dialog) => {
    page.dialogs.push(dialog.message());
    await dialog.dismiss();
  });
}

/**
 * 新しいコンテキストでページを開き、最初のパスワードが表示されるのを待つ。
 * @param {object} browser Playwright の Browser
 * @param {object} profile BROWSER_PROFILES の要素
 * @param {string} baseUrl
 * @param {{initScripts?: string[], contextOptions?: object, expectPassword?: boolean}} [options]
 */
async function openApp(browser, profile, baseUrl, options = {}) {
  const context = await browser.newContext({ ...profile.contextOptions, ...options.contextOptions });
  if (profile.canReadClipboard) {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseUrl).origin });
  }
  for (const script of options.initScripts || []) {
    await context.addInitScript(script);
  }
  const page = await context.newPage();
  _attachRecorders(page, profile.name);
  await page.goto(baseUrl);
  if (options.expectPassword !== false) {
    await page.waitForFunction(
      (selector) => document.querySelector(selector).value !== "",
      SELECTORS.password,
      { timeout: PASSWORD_WAIT_MILLISECONDS },
    );
  }
  return { context, page };
}

/**
 * writeText の引数を記録するスパイ。コピー対象が表示中のパスワードと一致するかの確認に使う。
 */
const CLIPBOARD_SPY_SCRIPT = `
  window.__copiedTexts = [];
  if (navigator.clipboard && navigator.clipboard.writeText) {
    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text) => {
      window.__copiedTexts.push(text);
      return originalWriteText(text);
    };
  }
`;

const CLIPBOARD_FAILURE_SCRIPT = `
  window.__writeTextCalls = 0;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: () => { window.__writeTextCalls += 1; return Promise.reject(new Error("blocked")); } },
  });
`;

async function getPassword(page) {
  return page.inputValue(SELECTORS.password);
}

/**
 * 要素の文字が空でなくなるまで待つ。
 */
async function waitForText(page, selector) {
  await page.waitForFunction((target) => document.querySelector(target).textContent !== "", selector);
}

async function getText(page, selector) {
  return (await page.textContent(selector)) || "";
}

/**
 * 長さの入力欄に値を入れ、Enter で確定する。
 */
async function commitLength(page, value) {
  await page.fill(SELECTORS.lengthInput, value);
  await page.press(SELECTORS.lengthInput, "Enter");
}

async function saveScreenshot(page, fileName) {
  fs.mkdirSync(SCREENSHOT_DIRECTORY, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIRECTORY, fileName), fullPage: true });
}

function writeEvidenceJson(fileName, data) {
  fs.mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIRECTORY, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

module.exports = {
  BROWSER_PROFILES,
  SELECTORS,
  MOBILE_VIEWPORT,
  DESKTOP_VIEWPORT,
  CLIPBOARD_SPY_SCRIPT,
  CLIPBOARD_FAILURE_SCRIPT,
  records,
  prepareBaseUrl,
  openApp,
  getPassword,
  getText,
  waitForText,
  commitLength,
  saveScreenshot,
  writeEvidenceJson,
};
