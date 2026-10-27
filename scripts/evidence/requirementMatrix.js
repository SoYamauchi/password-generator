"use strict";

/**
 * 要件定義書 7-2 のテスト観点(全行)と、それを確かめるテストIDの対応表。
 * test-report.md の行はこの表から作り、結果は JUnit から機械的に埋める。
 */
const REQUIREMENT_MATRIX = Object.freeze([
  {
    layer: "unit",
    ids: "F-01",
    viewpoint: "長さ8・16・24・128で指定どおり。7・129・空欄・負数・小数・文字列・NaN・1e9はエラーで生成しない",
    tests: ["U-01", "U-02"],
  },
  {
    layer: "unit",
    ids: "F-02, F-03",
    viewpoint: "4文字種のON/OFF全15通り、全部OFFはエラー、文字種の数が長さを超える設定は拒否",
    tests: ["U-03", "U-04", "U-05"],
  },
  {
    layer: "unit",
    ids: "F-04",
    viewpoint: "除外ONで 0 O 1 l I が出ない、OFFで出る",
    tests: ["U-06", "U-07"],
  },
  {
    layer: "unit",
    ids: "F-05",
    viewpoint: "指定した記号以外が出ない、重複除去、不正な文字の拒否、ONで0種類はエラー、OFFなら記号欄を使わない",
    tests: ["U-08", "U-09", "U-10", "U-11", "U-12"],
  },
  {
    layer: "unit",
    ids: "N-02",
    viewpoint: "棄却サンプリングの境界値(limit・limit-1・limit以上)、2のべき乗では棄却されない",
    tests: ["U-13", "U-14", "U-15"],
  },
  {
    layer: "unit",
    ids: "N-03",
    viewpoint: "Fisher–Yates(既知の乱数列で期待どおり)、シャッフル後も文字種の保証を維持",
    tests: ["U-16", "U-17"],
  },
  {
    layer: "unit",
    ids: "N-06",
    viewpoint: "文字数 N が正しく、強度が L × log2(N) と一致(既定で約157.3 bit)",
    tests: ["U-18", "U-19", "U-20"],
  },
  {
    layer: "unit",
    ids: "N-09",
    viewpoint: "保存された設定値の検証(不正なJSON・範囲外・型違い・未知の項目・null は初期値)",
    tests: ["U-21", "U-22"],
  },
  {
    layer: "integration",
    ids: "F-01〜F-05",
    viewpoint: "既定と複数の設定で10万件生成して制約が1件も破れない",
    tests: ["I-01"],
  },
  {
    layer: "integration",
    ids: "N-02",
    viewpoint: "文字の偏り(文字種内の均等性・文字種ごとの期待値)のカイ二乗検定",
    tests: ["I-02", "I-03", "I-04"],
  },
  {
    layer: "integration",
    ids: "N-03",
    viewpoint: "位置の偏り(位置ごとのカイ二乗検定)",
    tests: ["I-05"],
  },
  {
    layer: "integration",
    ids: "N-01",
    viewpoint: "重複なし(10万件で重複0件。安全性の証明ではない)",
    tests: ["I-06"],
  },
  {
    layer: "integration",
    ids: "N-01",
    viewpoint: "乱数源の差し替え(有限の列で出力が決まる、Math.random が例外でも生成成功)",
    tests: ["I-07", "I-08"],
  },
  {
    layer: "integration",
    ids: "N-01, N-09",
    viewpoint: "crypto.getRandomValues が使えないとエラーで生成せず、別の乱数に切り替わらない",
    tests: ["I-09"],
  },
  {
    layer: "integration",
    ids: "任意",
    viewpoint: "NIST SP 800-22 の頻度検定・連の検定の簡易版(安全性の証明ではない)",
    tests: ["I-11"],
  },
  {
    layer: "security",
    ids: "N-01",
    viewpoint: "アプリ本体に Math.random 等がなく、乱数は getRandomValues だけ",
    tests: ["S-01"],
  },
  {
    layer: "security",
    ids: "N-09",
    viewpoint: "innerHTML・outerHTML・insertAdjacentHTML・eval・new Function・document.write がない",
    tests: ["S-02"],
  },
  {
    layer: "security",
    ids: "N-04",
    viewpoint: "CSP の meta(script-src 自サイト・connect-src 'none')、インラインスクリプト・イベント属性・外部URLなし",
    tests: ["S-03", "S-04"],
  },
  {
    layer: "security",
    ids: "N-04, N-10",
    viewpoint: "リポジトリ内に秘密情報らしい文字列がない(個人情報も検査)",
    tests: ["S-05", "S-06"],
  },
  {
    layer: "security",
    ids: "静的解析",
    viewpoint: "ESLint の警告・エラーが0件",
    tests: ["S-07"],
  },
  {
    layer: "e2e",
    ids: "F-06",
    viewpoint: "開いた直後に1件生成、設定変更では変わらず、再生成で変わる",
    tests: ["E-01"],
  },
  {
    layer: "e2e",
    ids: "F-01, F-05, N-09",
    viewpoint: "入力エラー(7・129・abc・1.5・空欄、記号欄の英字・全角・絵文字・script)で再生成せず、スクリプトが実行・挿入されない",
    tests: ["E-02"],
  },
  {
    layer: "e2e",
    ids: "F-07, N-07",
    viewpoint: "コピーで内容が一致し「コピーしました」、writeText 失敗で失敗表示・選択状態",
    tests: ["E-03a", "E-03b", "E-03c"],
  },
  {
    layer: "e2e",
    ids: "F-08, N-06",
    viewpoint: "強度表示が既定で約157 bit・非常に強い、再生成時だけ更新、「概算」を表示",
    tests: ["E-04"],
  },
  {
    layer: "e2e",
    ids: "F-09, N-05, N-09",
    viewpoint: "設定の復元、保存領域・Cookie・URLにパスワードなし、不正な保存値でも初期値で起動",
    tests: ["E-05a", "E-05b"],
  },
  {
    layer: "e2e",
    ids: "F-10",
    viewpoint: "伏せ字の表示、コピーは実際の値、切り替えでパスワードは変わらない",
    tests: ["E-06"],
  },
  {
    layer: "e2e",
    ids: "N-04",
    viewpoint: "全リクエストのうち自サイト以外が0件、CSP の meta が仕様どおり",
    tests: ["E-07"],
  },
  {
    layer: "e2e",
    ids: "N-01, N-09",
    viewpoint: "getRandomValues を削除するとエラーで表示しない、Math.random が例外でも生成成功",
    tests: ["E-08"],
  },
  {
    layer: "e2e",
    ids: "N-08",
    viewpoint: "幅375pxで横スクロールなし、ボタン高さ44px以上、スクリーンショット",
    tests: ["E-09"],
  },
  {
    layer: "e2e",
    ids: "N-08",
    viewpoint: "生成時間が目安の100ms以内(計測値をログに出す)",
    tests: ["E-10", "I-10"],
  },
  {
    layer: "published",
    ids: "N-04, N-10",
    viewpoint: "公開URL(HTTPS)でコンソールの警告・エラー0件、自サイト以外へのリクエスト0件、外部スクリプト注入がCSPで阻止される",
    tests: ["P-01", "P-02", "P-06"],
  },
  {
    layer: "published",
    ids: "F-06, F-07, F-09, F-10",
    viewpoint: "スモークテスト(生成・再生成・コピー一致・設定の復元・伏せ字)",
    tests: ["P-03"],
  },
  {
    layer: "published",
    ids: "N-08",
    viewpoint: "公開URLで幅375pxでも横スクロールなし、スクリーンショット",
    tests: ["P-04"],
  },
  {
    layer: "published",
    ids: "N-10",
    viewpoint: "公開リポジトリの内容(gh api)に秘密情報・個人情報が0件",
    tests: ["P-05"],
  },
]);

const LAYER_LABELS = Object.freeze({
  unit: "単体",
  integration: "結合",
  security: "セキュリティ",
  e2e: "ブラウザ",
  published: "公開ページ",
});

module.exports = { REQUIREMENT_MATRIX, LAYER_LABELS };
