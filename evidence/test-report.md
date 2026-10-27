# テスト結果レポート

- 実行日時: 2026-10-27 16:31:02 JST
- 環境: Windows_NT 10.0.26300、Node v24.18.0、chromium 156.0.8078.4・webkit 27.2(詳細は evidence/environment.txt)
- テストケースの件数: 合格 71・不合格 0・未実施 0(合計 71。JUnit から集計)
- テスト観点(下表の行)の件数: 合 34・否 0・未実施 0(合計 34)
- このファイルは scripts/runEvidence.js が JUnit とログから機械的に生成したもので、手で書き換えていない。

## テスト観点と結果(要件定義書 7-2 の全行)

| 要件ID | テスト観点 | テストID(テスト名) | 結果(合/否/未実施) | 確認日 | エビデンス(ファイルと該当行) | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | [単体] 長さ8・16・24・128で指定どおり。7・129・空欄・負数・小数・文字列・NaN・1e9はエラーで生成しない | [F-01] U-01 長さ8・16・24・128で指定どおりの長さになる<br>[F-01] U-02 範囲外・空欄・負数・小数・文字列・NaN・1e9はエラーになり、生成しない(固まらない) | 合 | 2026-10-27 | evidence/unit.log:15, evidence/unit.log:16 |  |
| F-02, F-03 | [単体] 4文字種のON/OFF全15通り、全部OFFはエラー、文字種の数が長さを超える設定は拒否 | [F-02][F-03] U-03 文字種のON/OFF全15通りで、ONの文字種だけが使われ、それぞれ1文字以上含まれる<br>[F-02] U-04 文字種が全部OFFのときはエラーになる<br>[F-02] U-05 有効な文字種の数が長さを超える設定は拒否される(composePassword を直接呼ぶ) | 合 | 2026-10-27 | evidence/unit.log:12, evidence/unit.log:13, evidence/unit.log:14 |  |
| F-04 | [単体] 除外ONで 0 O 1 l I が出ない、OFFで出る | [F-04] U-06 除外ONのとき 0 O 1 l I が1文字も出ない<br>[F-04] U-07 除外OFFのとき 0 O 1 l I が出るようになる | 合 | 2026-10-27 | evidence/unit.log:5, evidence/unit.log:6 |  |
| F-05 | [単体] 指定した記号以外が出ない、重複除去、不正な文字の拒否、ONで0種類はエラー、OFFなら記号欄を使わない | [F-05] U-08 指定した記号以外の記号が出ない<br>[F-05] U-09 使う記号の重複は除去される<br>[F-05] U-10 空白・全角・絵文字・英数字は拒否される<br>[F-05] U-11 記号がONで0種類のときはエラーになる<br>[F-05] U-12 記号がOFFのときは、記号欄の内容(不正な値や空欄でも)を使わない | 合 | 2026-10-27 | evidence/unit.log:7, evidence/unit.log:8, evidence/unit.log:9, evidence/unit.log:10, evidence/unit.log:11 |  |
| N-02 | [単体] 棄却サンプリングの境界値(limit・limit-1・limit以上)、2のべき乗では棄却されない | [N-02] U-13 棄却サンプリングの境界値(limit ちょうどは棄却、limit-1 は採用)<br>[N-02] U-14 n が2のべき乗のときは棄却されない<br>[N-02] U-15 棄却が上限回数まで続いたら、無限に繰り返さずエラーになる | 合 | 2026-10-27 | evidence/unit.log:17, evidence/unit.log:18, evidence/unit.log:19 |  |
| N-03 | [単体] Fisher–Yates(既知の乱数列で期待どおり)、シャッフル後も文字種の保証を維持 | [N-03] U-16 シャッフルが Fisher–Yates(既知の乱数列で期待どおりの並び)<br>[N-03] U-17 シャッフル後も文字種の保証が維持される(既知の乱数列) | 合 | 2026-10-27 | evidence/unit.log:20, evidence/unit.log:21 |  |
| N-06 | [単体] 文字数 N が正しく、強度が L × log2(N) と一致(既定で約157.3 bit) | [N-06] U-18 文字種・除外・使う記号・重複除去を変えたときの文字数 N が正しい<br>[N-06] U-19 強度が L × log2(N) と一致する(手計算値と比較)<br>[N-06] U-20 強度の段階の閾値(50・80・112 bit)の境界 | 合 | 2026-10-27 | evidence/unit.log:22, evidence/unit.log:23, evidence/unit.log:24 |  |
| N-09 | [単体] 保存された設定値の検証(不正なJSON・範囲外・型違い・未知の項目・null は初期値) | [N-09] U-21 保存された設定値の検証(不正なJSON・範囲外・型違い・未知の項目・null は初期値に戻る)<br>[N-05][F-09] U-22 保存する文字列は設定の項目だけで、パスワードを含まない | 合 | 2026-10-27 | evidence/unit.log:25, evidence/unit.log:26 |  |
| F-01〜F-05 | [結合] 既定と複数の設定で10万件生成して制約が1件も破れない | [F-01][F-02][F-03][F-04][F-05] I-01 既定と複数の設定で10万件生成し、長さ・文字・保証・除外が1件も破れない | 合 | 2026-10-27 | evidence/integration.log:23 |  |
| N-02 | [結合] 文字の偏り(文字種内の均等性・文字種ごとの期待値)のカイ二乗検定 | [N-02] I-02 文字の偏り: 同じ文字種の中の各文字の出現回数が均等(カイ二乗検定・有意水準0.1%)<br>[N-02] I-03 文字種ごとの出現数が期待値 1 + (L - k) × m / N と合う(カイ二乗検定・有意水準0.1%)<br>[N-02] I-04 モジュロバイアスの検出条件: n = 3×2^30 で添字を3区間に分けると均等(カイ二乗検定・有意水準0.1%) | 合 | 2026-10-27 | evidence/integration.log:24, evidence/integration.log:25, evidence/integration.log:26 |  |
| N-03 | [結合] 位置の偏り(位置ごとのカイ二乗検定) | [N-03] I-05 位置の偏り: 各文字種の文字が現れる位置が均等(位置ごとのカイ二乗検定・有意水準0.1%) | 合 | 2026-10-27 | evidence/integration.log:27 |  |
| N-01 | [結合] 重複なし(10万件で重複0件。安全性の証明ではない) | [N-01] I-06 重複なし: 長さ24・全文字種で10万件生成して重複が0件(暗号論的な安全性の証明ではない) | 合 | 2026-10-27 | evidence/integration.log:28 |  |
| N-01 | [結合] 乱数源の差し替え(有限の列で出力が決まる、Math.random が例外でも生成成功) | [N-01] I-07 乱数源の差し替え: 同じ有限の値の列からは同じパスワードになり、出力が列だけで決まる<br>[N-01] I-08 Math.random を例外を投げるダミーにしても、生成が成功する | 合 | 2026-10-27 | evidence/integration.log:30, evidence/integration.log:31 |  |
| N-01, N-09 | [結合] crypto.getRandomValues が使えないとエラーで生成せず、別の乱数に切り替わらない | [N-01][N-09] I-09 crypto.getRandomValues が使えないと、別の乱数に切り替わらずエラーになり、生成されない | 合 | 2026-10-27 | evidence/integration.log:32 |  |
| 任意 | [結合] NIST SP 800-22 の頻度検定・連の検定の簡易版(安全性の証明ではない) | [N-01] I-11 (任意)NIST SP 800-22 の頻度検定・連の検定の簡易版(安全性の証明ではない) | 合 | 2026-10-27 | evidence/integration.log:36 |  |
| N-01 | [セキュリティ] アプリ本体に Math.random 等がなく、乱数は getRandomValues だけ | [N-01] S-01 アプリ本体に Math.random・Date.now・performance.now・シード等がなく、乱数は getRandomValues だけ | 合 | 2026-10-27 | evidence/security.log:61 |  |
| N-09 | [セキュリティ] innerHTML・outerHTML・insertAdjacentHTML・eval・new Function・document.write がない | [N-09] S-02 アプリ本体に innerHTML・outerHTML・insertAdjacentHTML・eval・new Function・document.write がない | 合 | 2026-10-27 | evidence/security.log:62 |  |
| N-04 | [セキュリティ] CSP の meta(script-src 自サイト・connect-src 'none')、インラインスクリプト・イベント属性・外部URLなし | [N-04] S-03 index.html に仕様どおりのCSPがあり、インラインスクリプト・イベント属性・外部URLがない<br>[N-04] S-04 アプリ本体のJS・CSSに外部URLと通信APIがない | 合 | 2026-10-27 | evidence/security.log:63, evidence/security.log:64 |  |
| N-04, N-10 | [セキュリティ] リポジトリ内に秘密情報らしい文字列がない(個人情報も検査) | [N-04][N-10] S-05 リポジトリ内に秘密情報らしい文字列がない<br>[N-10] S-06 リポジトリ内に個人情報(ホームのパス・PC名・ユーザー名・メール・IPアドレス)がない | 合 | 2026-10-27 | evidence/security.log:65, evidence/security.log:66 |  |
| 静的解析 | [セキュリティ] ESLint の警告・エラーが0件 | [静的解析] S-07 ESLint の警告・エラーが0件 | 合 | 2026-10-27 | evidence/security.log:67 |  |
| F-06 | [ブラウザ] 開いた直後に1件生成、設定変更では変わらず、再生成で変わる | [F-06] E-01 開いた直後に1件生成され、設定を変えても変わらず、再生成で変わる (chromium-desktop)<br>[F-06] E-01 開いた直後に1件生成され、設定を変えても変わらず、再生成で変わる (webkit-iphone) | 合 | 2026-10-27 | evidence/e2e.log:5, evidence/e2e.log:19 |  |
| F-01, F-05, N-09 | [ブラウザ] 入力エラー(7・129・abc・1.5・空欄、記号欄の英字・全角・絵文字・script)で再生成せず、スクリプトが実行・挿入されない | [F-01][F-05][N-09] E-02 入力エラーで再生成せず、記号欄のHTML/スクリプトが実行・挿入されない (chromium-desktop)<br>[F-01][F-05][N-09] E-02 入力エラーで再生成せず、記号欄のHTML/スクリプトが実行・挿入されない (webkit-iphone) | 合 | 2026-10-27 | evidence/e2e.log:6, evidence/e2e.log:20 |  |
| F-07, N-07 | [ブラウザ] コピーで内容が一致し「コピーしました」、writeText 失敗で失敗表示・選択状態 | [F-07][N-07] E-03a コピー成功で内容が一致し「コピーしました」が出る (chromium-desktop)<br>[F-07][N-07] E-03b writeText の失敗時は失敗を表示し、文字列を選択し、再試行しない (chromium-desktop)<br>[F-07][N-07] E-03c クリップボードAPIがない環境では失敗を表示する (chromium-desktop)<br>[F-07][N-07] E-03a コピー成功で内容が一致し「コピーしました」が出る (webkit-iphone)<br>[F-07][N-07] E-03b writeText の失敗時は失敗を表示し、文字列を選択し、再試行しない (webkit-iphone)<br>[F-07][N-07] E-03c クリップボードAPIがない環境では失敗を表示する (webkit-iphone) | 合 | 2026-10-27 | evidence/e2e.log:7, evidence/e2e.log:8, evidence/e2e.log:9, evidence/e2e.log:21, evidence/e2e.log:22, evidence/e2e.log:23 |  |
| F-08, N-06 | [ブラウザ] 強度表示が既定で約157 bit・非常に強い、再生成時だけ更新、「概算」を表示 | [F-08][N-06] E-04 強度表示は約157 bit・非常に強いで、再生成時だけ更新される (chromium-desktop)<br>[F-08][N-06] E-04 強度表示は約157 bit・非常に強いで、再生成時だけ更新される (webkit-iphone) | 合 | 2026-10-27 | evidence/e2e.log:10, evidence/e2e.log:24 |  |
| F-09, N-05, N-09 | [ブラウザ] 設定の復元、保存領域・Cookie・URLにパスワードなし、不正な保存値でも初期値で起動 | [F-09][N-05] E-05a 設定が復元され、保存領域・Cookie・URLにパスワードが含まれない (chromium-desktop)<br>[F-09][N-09] E-05b 不正な保存値でもエラーなく初期値で起動する (chromium-desktop)<br>[F-09][N-05] E-05a 設定が復元され、保存領域・Cookie・URLにパスワードが含まれない (webkit-iphone)<br>[F-09][N-09] E-05b 不正な保存値でもエラーなく初期値で起動する (webkit-iphone) | 合 | 2026-10-27 | evidence/e2e.log:11, evidence/e2e.log:12, evidence/e2e.log:25, evidence/e2e.log:26 |  |
| F-10 | [ブラウザ] 伏せ字の表示、コピーは実際の値、切り替えでパスワードは変わらない | [F-10] E-06 伏せ字に切り替えても、コピーは実際のパスワードで、パスワードは変わらない (chromium-desktop)<br>[F-10] E-06 伏せ字に切り替えても、コピーは実際のパスワードで、パスワードは変わらない (webkit-iphone) | 合 | 2026-10-27 | evidence/e2e.log:13, evidence/e2e.log:27 |  |
| N-04 | [ブラウザ] 全リクエストのうち自サイト以外が0件、CSP の meta が仕様どおり | [N-04] E-07 全テスト中の外部通信が0件で、CSPのmetaが仕様どおり | 合 | 2026-10-27 | evidence/e2e.log:35 |  |
| N-01, N-09 | [ブラウザ] getRandomValues を削除するとエラーで表示しない、Math.random が例外でも生成成功 | [N-01][N-09] E-08 乱数が使えないとエラーで生成せず、Math.random が使えなくても生成できる (chromium-desktop)<br>[N-01][N-09] E-08 乱数が使えないとエラーで生成せず、Math.random が使えなくても生成できる (webkit-iphone) | 合 | 2026-10-27 | evidence/e2e.log:14, evidence/e2e.log:28 |  |
| N-08 | [ブラウザ] 幅375pxで横スクロールなし、ボタン高さ44px以上、スクリーンショット | [N-08] E-09 幅375pxで横スクロールが出ず、ボタンの高さが44px以上 (chromium-desktop)<br>[N-08] E-09 幅375pxで横スクロールが出ず、ボタンの高さが44px以上 (webkit-iphone) | 合 | 2026-10-27 | evidence/e2e.log:16, evidence/e2e.log:30 |  |
| N-08 | [ブラウザ] 生成時間が目安の100ms以内(計測値をログに出す) | [N-08] I-10 生成時間の計測(Node、既定の設定)<br>[N-08] E-10 生成にかかる時間が目安の100ms以内 (chromium-desktop)<br>[N-08] E-10 生成にかかる時間が目安の100ms以内 (webkit-iphone) | 合 | 2026-10-27 | evidence/integration.log:33, evidence/e2e.log:18, evidence/e2e.log:32 |  |
| N-04, N-10 | [公開ページ] 公開URL(HTTPS)でコンソールの警告・エラー0件、自サイト以外へのリクエスト0件、外部スクリプト注入がCSPで阻止される | [N-04][N-10] P-01 公開URL(HTTPS)でコンソールの警告・エラーが0件、自サイト以外へのリクエストが0件<br>[N-04] P-02 外部スクリプトを注入しても実行されず、CSP違反として検出される<br>[N-04] P-06 公開ページの記録したリクエストを保存する | 合 | 2026-10-27 | evidence/published-e2e.log:7, evidence/published-e2e.log:9, evidence/published-e2e.log:17 |  |
| F-06, F-07, F-09, F-10 | [公開ページ] スモークテスト(生成・再生成・コピー一致・設定の復元・伏せ字) | [F-06][F-07][F-09][F-10] P-03 スモークテスト(生成・再生成・コピー・設定の復元・伏せ字) | 合 | 2026-10-27 | evidence/published-e2e.log:10 |  |
| N-08 | [公開ページ] 公開URLで幅375pxでも横スクロールなし、スクリーンショット | [N-08] P-04 公開URLで幅375pxでも横スクロールが出ない | 合 | 2026-10-27 | evidence/published-e2e.log:15 |  |
| N-10 | [公開ページ] 公開リポジトリの内容(gh api)に秘密情報・個人情報が0件 | [N-10] P-05 公開リポジトリの内容(gh api で取得)に秘密情報・個人情報が0件 | 合 | 2026-10-27 | evidence/published-e2e.log:16 |  |

照合: 7-2 の観点 34 行がすべて表にある(requirementMatrix.js の全行を出力)。

## 静的解析とカバレッジ

- ESLint: 終了コード 0(警告・エラー0件)(evidence/eslint.log)
- カバレッジ: passwordGenerator.js の行カバレッジ 99.06%、分岐 98.10%、関数 100.00%(evidence/coverage.txt)
- 統計値: evidence/statistics.log、リクエスト一覧: evidence/network-requests.json
- スクリーンショット: evidence/screenshots/(写っているパスワードはテスト用の使い捨ての値)

## 不良版でテストが失敗することの確認(7-3)

| 不良版 | 失敗するはずのテスト | 実際に失敗したテスト | 判定 | エビデンス |
| --- | --- | --- | --- | --- |
| 不良版1: 文字の選択を r % n(剰余だけ)に変えた版 | U-13, I-04 | I-04, U-13, U-15 | 合(検出できた) | evidence/mutation-1-modulo.log |
| 不良版2: 乱数源を Math.random に変えた版 | S-01, I-07, I-08 | I-07, I-08, S-01 | 合(検出できた) | evidence/mutation-2-math-random.log |
| 不良版3: 文字種の保証を外した版 | U-03, I-01 | I-01, I-03, U-03 | 合(検出できた) | evidence/mutation-3-no-guarantee.log |

## 公開ページの検証(9-2)

- 公開URL: https://soyamauchi.github.io/password-generator/
- リポジトリ: https://github.com/SoYamauchi/password-generator
- 確認日時: 2026-10-27 16:30:54 JST
- curl -sI: HTTP 200、HTTPS はい → 合(evidence/publish-log.txt)

| ファイル | ローカルの SHA-256 | 公開ページの SHA-256 | 一致 |
| --- | --- | --- | --- |
| index.html | 6092c44057950ab9c36dfad6661a90584f65a3d30ff84fc57bdf085424f09ce1 | 6092c44057950ab9c36dfad6661a90584f65a3d30ff84fc57bdf085424f09ce1 | 合 |
| passwordGenerator.js | 9d2bde3040c0ab482526869cfa3b20effb78febba49a52fea2bc5a39684a08a7 | 9d2bde3040c0ab482526869cfa3b20effb78febba49a52fea2bc5a39684a08a7 | 合 |
| app.js | 5116b001caa9b5a98576f4a8424ffe04d083723823660695f66dc428905a8d46 | 5116b001caa9b5a98576f4a8424ffe04d083723823660695f66dc428905a8d46 | 合 |
| style.css | b496cb22292a9ff9190c6884bee988c70e287a9eb39e5d065e88b82a0439ea75 | b496cb22292a9ff9190c6884bee988c70e287a9eb39e5d065e88b82a0439ea75 | 合 |

(evidence/deployed-hash-check.txt)
