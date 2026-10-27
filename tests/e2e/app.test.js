"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  BROWSER_PROFILES, SELECTORS, MOBILE_VIEWPORT, CLIPBOARD_SPY_SCRIPT, CLIPBOARD_FAILURE_SCRIPT, records,
  prepareBaseUrl, openApp, getPassword, getText, waitForText, commitLength, saveScreenshot, writeEvidenceJson,
} = require("./support.js");

const DEFAULT_LENGTH = 24;
const MIN_TOUCH_TARGET = 44;
const TIMING_RUNS = 100;
const TARGET_MILLISECONDS = 100;
const STORAGE_KEY = "passwordGenerator.settings.v1";
const EXPECTED_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; "
  + "connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

let baseUrl = "";
let closeServer = async () => {};
const browsers = new Map();

before(async () => {
  ({ baseUrl, close: closeServer } = await prepareBaseUrl());
  for (const profile of BROWSER_PROFILES) {
    browsers.set(profile.name, await profile.browserType.launch());
  }
});

after(async () => {
  for (const browser of browsers.values()) {
    await browser.close();
  }
  await closeServer();
});

/**
 * ページを開いて処理し、最後に必ずコンテキストを閉じる。
 */
async function withApp(profile, options, action) {
  const { context, page } = await openApp(browsers.get(profile.name), profile, baseUrl, options);
  try {
    return await action(page, context);
  } finally {
    await context.close();
  }
}

async function scenarioInitialGeneration(profile) {
  await withApp(profile, {}, async (page) => {
    const first = await getPassword(page);
    assert.equal(first.length, DEFAULT_LENGTH, "開いた直後に1件生成されている");
    await commitLength(page, "32");
    await page.click(SELECTORS.hasUppercase);
    await page.click(SELECTORS.isAmbiguousExcluded);
    await page.fill(SELECTORS.symbols, "#$");
    await page.press(SELECTORS.symbols, "Tab");
    assert.equal(await getPassword(page), first, "設定を変えても表示中のパスワードは変わらない");
    await page.click(SELECTORS.regenerateButton);
    const second = await getPassword(page);
    assert.notEqual(second, first, "再生成ボタンで変わる");
    assert.equal(second.length, 32);
  });
}

async function _assertLengthErrors(page, profile) {
  const original = await getPassword(page);
  for (const value of ["7", "129", "abc", "1.5", ""]) {
    await commitLength(page, value);
    assert.notEqual(await getText(page, SELECTORS.errorMessage), "", `長さ ${JSON.stringify(value)} でエラー表示`);
    await page.click(SELECTORS.regenerateButton);
    assert.equal(await getPassword(page), original, `長さ ${JSON.stringify(value)} では再生成しない`);
    if (value === "abc") {
      await saveScreenshot(page, `e2e-error-length-${profile.name}.png`);
    }
  }
  await page.fill(SELECTORS.lengthInput, "129");
  await page.press(SELECTORS.lengthInput, "Tab");
  assert.notEqual(await getText(page, SELECTORS.errorMessage), "", "フォーカスが外れたときも検証する");
  await commitLength(page, String(DEFAULT_LENGTH));
  assert.equal(await getText(page, SELECTORS.errorMessage), "", "正しい値でエラーが消える");
}

async function _assertSymbolErrors(page, profile) {
  const original = await getPassword(page);
  const elementCount = await page.evaluate(() => document.getElementsByTagName("*").length);
  for (const value of ["abc", "！＃", "\u{1F600}", "<script>alert(1)</script>", "<img src=x onerror=alert(1)>"]) {
    await page.fill(SELECTORS.symbols, value);
    await page.press(SELECTORS.symbols, "Tab");
    assert.notEqual(await getText(page, SELECTORS.errorMessage), "", `記号 ${value} でエラー表示`);
    await page.click(SELECTORS.regenerateButton);
    assert.equal(await getPassword(page), original, `記号 ${value} では再生成しない`);
  }
  await saveScreenshot(page, `e2e-error-symbols-${profile.name}.png`);
  assert.deepEqual(page.dialogs, [], "スクリプトが実行されない(dialog が発生しない)");
  const after = await page.evaluate(() => ({
    count: document.getElementsByTagName("*").length,
    hasInjected: document.querySelectorAll("img, body script").length > 0,
  }));
  assert.equal(after.count, elementCount, "DOM に要素が挿入されない");
  assert.equal(after.hasInjected, false);
}

async function scenarioInputErrors(profile) {
  await withApp(profile, {}, async (page) => {
    await _assertLengthErrors(page, profile);
    await _assertSymbolErrors(page, profile);
  });
}

async function _readCopiedText(page, profile) {
  const spied = await page.evaluate(() => window.__copiedTexts.slice());
  if (!profile.canReadClipboard) {
    return { spied, clipboard: null };
  }
  return { spied, clipboard: await page.evaluate(() => navigator.clipboard.readText()) };
}

async function scenarioCopySuccess(profile) {
  await withApp(profile, { initScripts: [CLIPBOARD_SPY_SCRIPT] }, async (page) => {
    const password = await getPassword(page);
    await page.click(SELECTORS.copyButton);
    await waitForText(page, SELECTORS.copyStatus);
    assert.equal(await getText(page, SELECTORS.copyStatus), "コピーしました");
    const { spied, clipboard } = await _readCopiedText(page, profile);
    assert.deepEqual(spied, [password], "writeText に渡した内容が表示中のパスワードと一致");
    if (clipboard !== null) {
      assert.equal(clipboard, password, "クリップボードの内容が表示中のパスワードと一致");
    }
  });
}

async function scenarioCopyFailure(profile) {
  await withApp(profile, { initScripts: [CLIPBOARD_FAILURE_SCRIPT] }, async (page) => {
    const password = await getPassword(page);
    await page.click(SELECTORS.copyButton);
    await waitForText(page, SELECTORS.copyStatus);
    const status = await getText(page, SELECTORS.copyStatus);
    assert.ok(status.includes("コピーできませんでした"), "失敗が表示される");
    assert.ok(!status.includes("コピーしました"), "成功メッセージは出ない");
    const selection = await page.evaluate((selector) => {
      const input = document.querySelector(selector);
      return { start: input.selectionStart, end: input.selectionEnd, isFocused: document.activeElement === input,
        calls: window.__writeTextCalls };
    }, SELECTORS.password);
    assert.deepEqual(selection, { start: 0, end: password.length, isFocused: true, calls: 1 }, "全体が選択され、再試行しない");
    await saveScreenshot(page, `e2e-copy-failure-${profile.name}.png`);
  });
}

async function scenarioClipboardUnavailable(profile) {
  const removeClipboard = "Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });";
  await withApp(profile, { initScripts: [removeClipboard] }, async (page) => {
    await page.click(SELECTORS.copyButton);
    await waitForText(page, SELECTORS.copyStatus);
    assert.ok((await getText(page, SELECTORS.copyStatus)).includes("コピーできませんでした"));
  });
}

async function scenarioStrength(profile) {
  await withApp(profile, {}, async (page) => {
    assert.equal(await getText(page, SELECTORS.strengthBits), "(約157 bit)");
    assert.equal(await getText(page, SELECTORS.strengthLabel), "非常に強い");
    assert.ok((await page.textContent("body")).includes("文字集合に基づく強度の概算"), "概算であることを表示");
    await page.click(SELECTORS.hasSymbols);
    await commitLength(page, "16");
    assert.equal(await getText(page, SELECTORS.strengthBits), "(約157 bit)", "再生成前は変わらない");
    await page.click(SELECTORS.regenerateButton);
    // 手計算: N = 26 + 26 + 10 = 62、16 × log2(62) = 95.27 → 約95 bit、80以上112未満 = 強い
    const expectedBits = Math.round(16 * Math.log2(62));
    assert.equal(await getText(page, SELECTORS.strengthBits), `(約${expectedBits} bit)`);
    assert.equal(await getText(page, SELECTORS.strengthLabel), "強い");
  });
}

async function _changeSettings(page) {
  await commitLength(page, "40");
  await page.click(SELECTORS.hasDigits);
  await page.click(SELECTORS.isAmbiguousExcluded);
  await page.fill(SELECTORS.symbols, "#$%%");
  await page.press(SELECTORS.symbols, "Tab");
}

async function _readFormState(page) {
  return page.evaluate((selectors) => ({
    length: document.querySelector(selectors.lengthInput).value,
    range: document.querySelector(selectors.lengthRange).value,
    hasDigits: document.querySelector(selectors.hasDigits).checked,
    isAmbiguousExcluded: document.querySelector(selectors.isAmbiguousExcluded).checked,
    symbols: document.querySelector(selectors.symbols).value,
  }), SELECTORS);
}

async function _collectStoredText(page, context) {
  const pageData = await page.evaluate(() => {
    const dump = (storage) => Object.keys(storage).map((key) => `${key}=${storage.getItem(key)}`).join("\n");
    return [dump(localStorage), dump(sessionStorage), document.cookie, location.href].join("\n");
  });
  const cookies = (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("\n");
  return `${pageData}\n${cookies}`;
}

async function scenarioPersistence(profile) {
  await withApp(profile, { initScripts: [CLIPBOARD_SPY_SCRIPT] }, async (page, context) => {
    const seenPasswords = [await getPassword(page)];
    await _changeSettings(page);
    await page.click(SELECTORS.regenerateButton);
    seenPasswords.push(await getPassword(page));
    await page.click(SELECTORS.copyButton);
    await page.reload();
    await page.waitForFunction((selector) => document.querySelector(selector).value !== "", SELECTORS.password);
    seenPasswords.push(await getPassword(page));
    const expected = { length: "40", range: "40", hasDigits: false, isAmbiguousExcluded: true, symbols: "#$%" };
    assert.deepEqual(await _readFormState(page), expected, "再読み込みで設定が復元される");
    const stored = await _collectStoredText(page, context);
    for (const password of seenPasswords) {
      assert.equal(stored.includes(password), false, "保存領域とURLにパスワードが含まれない");
    }
  });
}

async function scenarioInvalidStorage(profile) {
  const invalidValues = ["{oops", JSON.stringify({ length: 999 }), "null", JSON.stringify({ length: "24" })];
  for (const value of invalidValues) {
    const script = `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(value)});`;
    await withApp(profile, { initScripts: [script] }, async (page) => {
      const errorsBefore = records.pageErrors.length;
      assert.equal((await getPassword(page)).length, DEFAULT_LENGTH, `保存値 ${value} でも初期値で起動`);
      assert.equal(await page.inputValue(SELECTORS.lengthInput), String(DEFAULT_LENGTH));
      assert.equal(records.pageErrors.length, errorsBefore, "pageerror が0件");
    });
  }
}

async function scenarioMask(profile) {
  await withApp(profile, { initScripts: [CLIPBOARD_SPY_SCRIPT] }, async (page) => {
    const password = await getPassword(page);
    assert.equal(await page.getAttribute(SELECTORS.password, "type"), "text", "初期状態は表示");
    await page.click(SELECTORS.visibilityButton);
    assert.equal(await page.getAttribute(SELECTORS.password, "type"), "password", "伏せ字になる");
    assert.equal(await page.getAttribute(SELECTORS.visibilityButton, "aria-pressed"), "true");
    await saveScreenshot(page, `e2e-masked-${profile.name}.png`);
    await page.click(SELECTORS.copyButton);
    await waitForText(page, SELECTORS.copyStatus);
    assert.deepEqual(await page.evaluate(() => window.__copiedTexts.slice()), [password], "コピーは実際のパスワード");
    await page.click(SELECTORS.visibilityButton);
    assert.equal(await page.getAttribute(SELECTORS.password, "type"), "text");
    assert.equal(await getPassword(page), password, "切り替えてもパスワードは変わらない");
  });
}

async function scenarioRandomUnavailable(profile) {
  const removeRandom = "delete Crypto.prototype.getRandomValues;";
  await withApp(profile, { initScripts: [removeRandom], expectPassword: false }, async (page) => {
    await waitForText(page, SELECTORS.errorMessage);
    assert.ok((await getText(page, SELECTORS.errorMessage)).includes("安全な乱数"), "エラーが表示される");
    assert.equal(await getPassword(page), "", "パスワードが表示されない");
    assert.equal(await page.isDisabled(SELECTORS.copyButton), true);
    await saveScreenshot(page, `e2e-random-unavailable-${profile.name}.png`);
  });
  const throwingMathRandom = "Math.random = () => { throw new Error('Math.random must not be used'); };";
  await withApp(profile, { initScripts: [throwingMathRandom] }, async (page) => {
    assert.equal((await getPassword(page)).length, DEFAULT_LENGTH, "Math.random が使えなくても生成できる");
    await page.click(SELECTORS.regenerateButton);
    assert.equal(await getText(page, SELECTORS.errorMessage), "");
  });
}

async function _measureLayout(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    controls: [...document.querySelectorAll("button, input[type=text]")].map((element) => ({
      id: element.id, height: element.getBoundingClientRect().height,
    })),
  }));
}

async function scenarioLayout(profile) {
  await withApp(profile, { contextOptions: { viewport: MOBILE_VIEWPORT } }, async (page) => {
    const layout = await _measureLayout(page);
    console.log(`[STAT] E-09 レイアウト(${profile.name}) 幅=${layout.innerWidth} scrollWidth=${layout.scrollWidth}`
      + ` 最小の高さ=${Math.min(...layout.controls.map((control) => control.height))}`);
    assert.ok(layout.scrollWidth <= layout.innerWidth, "幅375pxで横スクロールが出ない");
    for (const control of layout.controls) {
      assert.ok(control.height >= MIN_TOUCH_TARGET, `${control.id} の高さ ${control.height}px`);
    }
    await saveScreenshot(page, `e2e-mobile-375-${profile.name}.png`);
  });
  if (profile.name === "chromium-desktop") {
    await withApp(profile, {}, async (page) => saveScreenshot(page, "e2e-desktop.png"));
  }
}

async function scenarioTiming(profile) {
  await withApp(profile, {}, async (page) => {
    const timing = await page.evaluate((runs) => {
      const settings = globalThis.PasswordGenerator.getDefaultSettings();
      const durations = [];
      for (let i = 0; i < runs; i += 1) {
        const startedAt = performance.now();
        globalThis.PasswordGenerator.generatePassword(settings);
        durations.push(performance.now() - startedAt);
      }
      const clickStartedAt = performance.now();
      document.getElementById("regenerate-button").click();
      return { average: durations.reduce((a, b) => a + b, 0) / runs, maximum: Math.max(...durations),
        clickToRender: performance.now() - clickStartedAt };
    }, TIMING_RUNS);
    console.log(`[STAT] E-10 生成時間(${profile.name}) 回数=${TIMING_RUNS} 平均ms=${timing.average.toFixed(3)}`
      + ` 最大ms=${timing.maximum.toFixed(3)} クリックから表示ms=${timing.clickToRender.toFixed(3)}`
      + ` 目安ms=${TARGET_MILLISECONDS}`);
    assert.ok(timing.clickToRender < TARGET_MILLISECONDS, `クリックから表示まで ${timing.clickToRender}ms`);
  });
}

async function scenarioDisclaimer(profile) {
  await withApp(profile, { contextOptions: { viewport: MOBILE_VIEWPORT } }, async (page) => {
    const disclaimer = await getText(page, "#disclaimer");
    assert.ok(disclaimer.includes("免責事項"), "見出しがある");
    assert.ok(disclaimer.includes("ご自身の責任"), "自己責任であることを書いている");
    assert.ok(disclaimer.includes("漏洩"), "漏洩についても書いている");
    assert.equal(await page.isVisible("#disclaimer"), true, "画面に表示されている");
  });
}

const SCENARIOS = Object.freeze([
  { title: "[F-06] E-01 開いた直後に1件生成され、設定を変えても変わらず、再生成で変わる", run: scenarioInitialGeneration },
  { title: "[F-01][F-05][N-09] E-02 入力エラーで再生成せず、記号欄のHTML/スクリプトが実行・挿入されない", run: scenarioInputErrors },
  { title: "[F-07][N-07] E-03a コピー成功で内容が一致し「コピーしました」が出る", run: scenarioCopySuccess },
  { title: "[F-07][N-07] E-03b writeText の失敗時は失敗を表示し、文字列を選択し、再試行しない", run: scenarioCopyFailure },
  { title: "[F-07][N-07] E-03c クリップボードAPIがない環境では失敗を表示する", run: scenarioClipboardUnavailable },
  { title: "[F-08][N-06] E-04 強度表示は約157 bit・非常に強いで、再生成時だけ更新される", run: scenarioStrength },
  { title: "[F-09][N-05] E-05a 設定が復元され、保存領域・Cookie・URLにパスワードが含まれない", run: scenarioPersistence },
  { title: "[F-09][N-09] E-05b 不正な保存値でもエラーなく初期値で起動する", run: scenarioInvalidStorage },
  { title: "[F-10] E-06 伏せ字に切り替えても、コピーは実際のパスワードで、パスワードは変わらない", run: scenarioMask },
  { title: "[N-01][N-09] E-08 乱数が使えないとエラーで生成せず、Math.random が使えなくても生成できる", run: scenarioRandomUnavailable },
  { title: "[N-08] E-09 幅375pxで横スクロールが出ず、ボタンの高さが44px以上", run: scenarioLayout },
  { title: "[N-08] E-10 生成にかかる時間が目安の100ms以内", run: scenarioTiming },
  { title: "[追加] E-11 免責事項(自己責任であること)が画面に表示される", run: scenarioDisclaimer },
]);

for (const profile of BROWSER_PROFILES) {
  for (const { title, run } of SCENARIOS) {
    test(`${title} (${profile.name})`, () => run(profile));
  }
}

test("[N-04] E-07 全テスト中の外部通信が0件で、CSPのmetaが仕様どおり", async () => {
  const profile = BROWSER_PROFILES[0];
  await withApp(profile, {}, async (page) => {
    assert.equal(await page.getAttribute("meta[http-equiv='Content-Security-Policy']", "content"), EXPECTED_CSP);
  });
  const origin = new URL(baseUrl).origin;
  const external = records.requests.filter((request) => new URL(request.url).origin !== origin);
  const summary = { origin, total: records.requests.length, external, requests: records.requests };
  writeEvidenceJson("network-requests.json", summary);
  console.log(`[STAT] E-07 リクエスト 合計=${records.requests.length} 自サイト以外=${external.length}`);
  console.log(`[STAT] E-07 pageerror=${records.pageErrors.length}`);
  assert.equal(records.requests.length > 0, true);
  assert.deepEqual(external, [], "自サイト以外へのリクエストが0件");
  assert.deepEqual(records.pageErrors, [], "全テストで pageerror が0件");
});
