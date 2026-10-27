"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  BROWSER_PROFILES, SELECTORS, MOBILE_VIEWPORT, CLIPBOARD_SPY_SCRIPT, records,
  openApp, getPassword, getText, waitForText, commitLength, saveScreenshot, writeEvidenceJson,
} = require("./support.js");
const {
  CREDENTIAL_PATTERNS, createLocalIdentityPatterns, findSensitiveMatches,
} = require("../helpers/sensitivePatterns.js");

const BASE_URL = process.env.BASE_URL || "";
const PUBLISHED_REPOSITORY = process.env.PUBLISHED_REPOSITORY || "";
const SKIP_REASON = BASE_URL.startsWith("https://")
  ? false
  : "公開URL(BASE_URL=https://...)が指定されていないため未実施";
const REPOSITORY_SKIP_REASON = SKIP_REASON || (PUBLISHED_REPOSITORY ? false : "PUBLISHED_REPOSITORY が未指定のため未実施");
const DEFAULT_LENGTH = 24;
const INJECTED_SCRIPT_URL = "https://example.com/injected-by-test.js";
const BINARY_EXTENSIONS = Object.freeze([".png", ".jpg", ".ico"]);
const GH_MAX_BUFFER = 64 * 1024 * 1024;
const [CHROMIUM_PROFILE, WEBKIT_PROFILE] = BROWSER_PROFILES;

const browsers = new Map();
// P-02 で意図的に注入したリクエスト(CSP で阻止されることの確認用)。P-06 では別に記録する
const intentionalInjections = [];

before(async () => {
  if (SKIP_REASON) {
    return;
  }
  for (const profile of BROWSER_PROFILES) {
    browsers.set(profile.name, await profile.browserType.launch());
  }
});

after(async () => {
  for (const browser of browsers.values()) {
    await browser.close();
  }
});

async function withPublishedApp(profile, options, action) {
  const { context, page } = await openApp(browsers.get(profile.name), profile, BASE_URL, options);
  try {
    return await action(page, context);
  } finally {
    await context.close();
  }
}

function _recordsFrom(startIndex, key) {
  return records[key].slice(startIndex[key]);
}

async function _operateApp(page) {
  await page.click(SELECTORS.regenerateButton);
  await page.click(SELECTORS.copyButton);
  await waitForText(page, SELECTORS.copyStatus);
  await page.click(SELECTORS.visibilityButton);
  await commitLength(page, "30");
}

test("[N-04][N-10] P-01 公開URL(HTTPS)でコンソールの警告・エラーが0件、自サイト以外へのリクエストが0件",
  { skip: SKIP_REASON }, async () => {
    for (const profile of BROWSER_PROFILES) {
      const startIndex = { requests: records.requests.length, consoleMessages: records.consoleMessages.length,
        pageErrors: records.pageErrors.length };
      await withPublishedApp(profile, {}, async (page) => {
        assert.ok(page.url().startsWith("https://"), "HTTPS で開いている");
        await _operateApp(page);
      });
      const problems = _recordsFrom(startIndex, "consoleMessages")
        .filter((message) => ["warning", "error"].includes(message.type));
      const origin = new URL(BASE_URL).origin;
      const external = _recordsFrom(startIndex, "requests").filter((request) => new URL(request.url).origin !== origin);
      console.log(`[STAT] P-01 (${profile.name}) コンソール警告・エラー=${problems.length} 自サイト以外=${external.length}`);
      assert.deepEqual(problems, [], `${profile.name}: コンソールの警告・エラー`);
      assert.deepEqual(external, [], `${profile.name}: 自サイト以外へのリクエスト`);
      assert.deepEqual(_recordsFrom(startIndex, "pageErrors"), []);
    }
  });

const VIOLATION_RECORDER_SCRIPT = `
  window.__violations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
  });
`;

test("[N-04] P-02 外部スクリプトを注入しても実行されず、CSP違反として検出される", { skip: SKIP_REASON }, async () => {
  const requestStartIndex = records.requests.length;
  await withPublishedApp(CHROMIUM_PROFILE, { initScripts: [VIOLATION_RECORDER_SCRIPT] }, async (page) => {
    let injectionError = null;
    try {
      await page.addScriptTag({ url: INJECTED_SCRIPT_URL });
    } catch (error) {
      injectionError = error;
    }
    const violations = await page.evaluate(() => window.__violations.slice());
    const isExecuted = await page.evaluate(() => typeof window.__injectedByTest !== "undefined");
    console.log(`[STAT] P-02 注入の結果 例外=${injectionError ? "あり" : "なし"} 違反=${JSON.stringify(violations)}`);
    assert.ok(injectionError, "スクリプトの読み込みが失敗する");
    assert.equal(isExecuted, false, "注入したスクリプトは実行されない");
    assert.ok(violations.some((violation) => violation.blockedURI.startsWith("https://example.com")
      && violation.directive.startsWith("script-src")), "script-src の違反として検出される");
  });
  intentionalInjections.push(...records.requests.slice(requestStartIndex)
    .filter((request) => request.url === INJECTED_SCRIPT_URL));
});

async function _assertSmokeGeneration(page) {
  const first = await getPassword(page);
  assert.equal(first.length, DEFAULT_LENGTH, "開くと1件生成される");
  assert.ok((await getText(page, "#disclaimer")).includes("ご自身の責任"), "免責事項が表示される");
  await page.click(SELECTORS.regenerateButton);
  const second = await getPassword(page);
  assert.notEqual(second, first, "再生成で変わる");
  await page.click(SELECTORS.copyButton);
  await waitForText(page, SELECTORS.copyStatus);
  assert.equal(await getText(page, SELECTORS.copyStatus), "コピーしました");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), second, "クリップボードの内容が一致");
  await page.click(SELECTORS.visibilityButton);
  assert.equal(await page.getAttribute(SELECTORS.password, "type"), "password", "伏せ字に切り替えられる");
}

test("[F-06][F-07][F-09][F-10] P-03 スモークテスト(生成・再生成・コピー・設定の復元・伏せ字)", { skip: SKIP_REASON }, async () => {
  await withPublishedApp(CHROMIUM_PROFILE, { initScripts: [CLIPBOARD_SPY_SCRIPT] }, async (page) => {
    await _assertSmokeGeneration(page);
    await commitLength(page, "33");
    await page.click(SELECTORS.hasSymbols);
    await page.reload();
    await page.waitForFunction((selector) => document.querySelector(selector).value !== "", SELECTORS.password);
    assert.equal(await page.inputValue(SELECTORS.lengthInput), "33", "設定が再読み込みで復元される");
    assert.equal(await page.isChecked(SELECTORS.hasSymbols), false);
    assert.equal((await getPassword(page)).length, 33);
  });
});

test("[N-08] P-04 公開URLで幅375pxでも横スクロールが出ない", { skip: SKIP_REASON }, async () => {
  for (const profile of [CHROMIUM_PROFILE, WEBKIT_PROFILE]) {
    await withPublishedApp(profile, { contextOptions: { viewport: MOBILE_VIEWPORT } }, async (page) => {
      const widths = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
      }));
      console.log(`[STAT] P-04 (${profile.name}) 幅=${widths.innerWidth} scrollWidth=${widths.scrollWidth}`);
      assert.ok(widths.scrollWidth <= widths.innerWidth);
      await saveScreenshot(page, `published-mobile-375-${profile.name}.png`);
    });
  }
  await withPublishedApp(CHROMIUM_PROFILE, {}, async (page) => saveScreenshot(page, "published-desktop.png"));
});

function _runGhApi(endpoint, jqQuery) {
  const result = spawnSync("gh", ["api", endpoint, "-q", jqQuery], { encoding: "utf8", maxBuffer: GH_MAX_BUFFER });
  assert.equal(result.status, 0, `gh api ${endpoint} が失敗: ${result.stderr}`);
  return result.stdout;
}

function _scanPublishedFile(file, patterns) {
  const base64 = _runGhApi(`repos/${PUBLISHED_REPOSITORY}/git/blobs/${file.sha}`, ".content");
  const text = Buffer.from(base64.replace(/\s/g, ""), "base64").toString("utf8");
  return findSensitiveMatches(text, patterns, { includePersonalFormats: true })
    .map((finding) => `${file.path}:${finding.line} ${finding.label}`);
}

test("[N-10] P-05 公開リポジトリの内容(gh api で取得)に秘密情報・個人情報が0件", { skip: REPOSITORY_SKIP_REASON }, () => {
  const tree = JSON.parse(_runGhApi(`repos/${PUBLISHED_REPOSITORY}/git/trees/main?recursive=1`, "."));
  const files = tree.tree.filter((entry) => entry.type === "blob");
  const textFiles = files.filter((entry) => !BINARY_EXTENSIONS.includes(path.extname(entry.path).toLowerCase()));
  const patterns = [...CREDENTIAL_PATTERNS, ...createLocalIdentityPatterns()];
  const findings = textFiles.flatMap((file) => _scanPublishedFile(file, patterns));
  console.log(`[STAT] P-05 公開リポジトリ ファイル=${files.length} 検査したテキスト=${textFiles.length}`
    + ` 検出=${findings.length} 切り詰め=${tree.truncated}`);
  findings.forEach((finding) => console.log(`[SCAN] 検出: ${finding}`));
  assert.equal(tree.truncated, false, "ファイル一覧が切り詰められていない");
  assert.deepEqual(findings, []);
});

test("[N-04] P-06 公開ページの記録したリクエストを保存する", { skip: SKIP_REASON }, () => {
  const origin = new URL(BASE_URL).origin;
  const external = records.requests.filter((request) => new URL(request.url).origin !== origin
    && !intentionalInjections.includes(request));
  writeEvidenceJson("published-network-requests.json", {
    origin, total: records.requests.length, external, intentionalInjections, requests: records.requests,
  });
  console.log(`[STAT] P-06 公開ページのリクエスト 合計=${records.requests.length} 自サイト以外=${external.length}`
    + ` P-02で意図的に注入(CSPで阻止)=${intentionalInjections.length}`);
  assert.deepEqual(external, []);
});
