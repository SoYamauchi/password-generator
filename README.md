# パスワード生成

推測されにくいパスワードを、ブラウザだけで生成してコピーできる個人用のWebアプリです。
サーバー・DB・アカウント機能はなく、外部への通信もしません。

- 公開URL: https://soyamauchi.github.io/password-generator/
- リポジトリ: https://github.com/SoYamauchi/password-generator
- 乱数は `crypto.getRandomValues` だけを使います。使えない環境では、別の乱数に切り替えず、エラーを表示して生成を止めます。

## 使い方

1. ページを開くと、パスワードが1件生成されます。
2. 長さ(8〜128文字)、文字種、紛らわしい文字の除外、使う記号を選びます。設定を変えても、表示中のパスワードは変わりません。
3. 「再生成」を押すと、その設定で新しいパスワードを作ります。
4. 「コピー」を押すとクリップボードにコピーします。コピーできなかったときは、パスワードを選択状態にするので、手動でコピーしてください。
5. 「伏せ字にする」で、画面上の表示を伏せ字にできます(コピーされるのは実際のパスワードです)。

設定(長さ・文字種・除外・使う記号)だけをブラウザの `localStorage` に保存します。パスワードは保存しません。

## 強度表示の意味

画面の強度は「文字集合に基づく強度の概算」です。使える文字の数 N と長さ L から、`L × log2(N)` で計算します。

- 文字種ごとに最低1文字を必ず入れるため、実際のエントロピーはこの値以下になります(この偏りは計算に入れていません)。
- 段階の閾値は**暫定値**です(`passwordGenerator.js` の `STRENGTH_LEVELS` で1か所に定義しています)。

| 段階 | 概算の bit 数 |
| --- | --- |
| 弱い | 50 未満 |
| 普通 | 50 以上 80 未満 |
| 強い | 80 以上 112 未満 |
| 非常に強い | 112 以上 |

既定の設定(94種類の文字・長さ24)では、約157 bit(非常に強い)です。

## ローカルでの確認

Node.js 20 以上が必要です。

```bash
node scripts/serve.js
```

ブラウザで `http://127.0.0.1:8080/` を開きます(ポートは環境変数 `PORT` で変えられます)。
アプリ本体は外部ライブラリを使っていないので、`index.html` をそのまま開いても動く作りですが、CSP の `'self'` の扱いはブラウザによって異なるため、確認はローカルサーバーで行ってください。

## テストの実行

```bash
npm install
```

```bash
npx playwright install chromium webkit
```

```bash
npm test
```

```bash
npm run test:evidence
```

- `npm test`: 単体・結合・セキュリティ・ブラウザのテストを順に実行します。
- `npm run test:evidence`: 全テスト・ESLint・カバレッジ・不良版(ミューテーション)の確認を実行し、結果を `evidence/` に保存します。`evidence/test-report.md` が要件ごとの結果の一覧です。
- 公開ページのテストは、`BASE_URL`(公開URL)と `PUBLISHED_REPOSITORY`(`owner/リポジトリ名`)を指定したときだけ実行します。指定しないときは「未実施」として記録します。
- テストのログには、生成したパスワードの実値を出しません。スクリーンショットに写っているパスワードは、**テスト用の使い捨ての値**です。

| フォルダ | 内容 |
| --- | --- |
| `tests/unit/` | 単体テスト(決定的なダミー乱数を使う) |
| `tests/integration/` | 結合テスト(実際の `crypto`。10万件の生成、カイ二乗検定など) |
| `tests/security/` | 静的検査(禁止API・CSP・秘密情報・個人情報)と ESLint |
| `tests/e2e/` | Playwright のブラウザテスト(Chromium と、iPhone 相当の WebKit) |

ESLint は公式の `@eslint/js` だけを使い、外部プラグインは追加していません。`Math.random`・`innerHTML`・`eval` などは規則で禁止しています。

## 手動確認(自動テストが未実施のときの代わりの手順)

1. 公開URLを PC のブラウザ(Chrome・Edge・Firefox・Safari)とスマホ(iPhone の Safari、Android の Chrome)で開く。
2. パスワードが表示され、「再生成」で変わることを確認する。
3. 「コピー」を押して「コピーしました」と出たら、メモ帳などに貼り付けて表示と同じか確認する。
4. 長さに `7` や `abc` を入れて Enter を押し、エラーが出て、パスワードが変わらないことを確認する。
5. 設定を変えてページを再読み込みし、設定が残っていることを確認する。
6. スマホで横スクロールが出ないこと、ボタンが押しやすいことを確認する。

## セキュリティ上の設計と制約

- CSP は `index.html` の meta タグで設定しています。

  ```text
  default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
  connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'
  ```

- **GitHub Pages ではHTTPヘッダーを設定できないため、meta タグでは効かない次の項目は設定していません。**
  - `frame-ancestors`(他のサイトの iframe への埋め込みの禁止。クリックジャッキング対策)
  - `report-uri` / `report-to`(違反の報告先)
  - `sandbox`
  - `X-Frame-Options`、`X-Content-Type-Options` などのセキュリティヘッダー
- 画面への出力は `textContent`(入力欄は `value`)だけで行い、`innerHTML` などは使いません。
- 外部ライブラリ・CDN・Webフォント・アクセス解析は読み込みません。

## GitHub Pages への公開

`scripts/publish.js` で、次の手順を実行しました(実行したコマンドと出力は `evidence/publish-log.txt`)。

1. 公開前の確認: 全テストの合格、作業ツリーと git 履歴の秘密情報の検査、コミットするファイルの個人情報(ホームのパス・PC名・ユーザー名・メールアドレス・IPアドレス)の検査、git のメールアドレスが GitHub の noreply であること。
2. `gh repo create <リポジトリ名> --public --source=. --remote=origin --push` で、公開リポジトリを作って push。
3. `gh api -X POST repos/<owner>/<repo>/pages -f "source[branch]=main" -f "source[path]=/"` で GitHub Pages を有効化。
4. `gh api repos/<owner>/<repo>/pages/builds/latest` が `built` になるまで待機。
5. 公開URLを `gh api repos/<owner>/<repo>/pages` の `html_url` から取得し、`curl -sI` で HTTP 200 と HTTPS を確認。
6. 公開ページの `index.html`・`passwordGenerator.js`・`app.js`・`style.css` の SHA-256 がローカルと一致することを確認(`evidence/deployed-hash-check.txt`)。

認証は、このPCに設定済みの GitHub CLI のログイン状態だけを使います。認証情報はリポジトリに置きません。
Jekyll の処理を避けるため、`.nojekyll` を置いています。

## 公開してよい情報の条件

このリポジトリは公開リポジトリです。次のものを置かないでください。

- 鍵・パスワード・認証用の文字列などの秘密情報
- ホームディレクトリのパス、PC名、ユーザー名、個人のメールアドレス、IPアドレス
- 実際に使うパスワード(スクリーンショットに写っているのはテスト用の使い捨ての値です)

`evidence/` のログは、保存時にホームのパス・ユーザー名・PC名を `<HOME>`・`<USER>`・`<HOST>` に置き換えています。
`tests/security/` の検査が、これらが含まれていないことを毎回確認します。

## 仕様の解釈

- 紛らわしい文字の除外の初期値は OFF です(既定の強度「94種類・約157 bit」と合わせるため)。
- 保存された設定は、項目が1つでも不正(未知の項目を含む)なら、全体を初期値に戻します。
- 文字種を全部 OFF にしようとすると、外したチェックを元に戻し、エラーを表示します。
- 伏せ字のままコピーに失敗したときは、手動でコピーできるように表示に戻してから選択します。
- 入力エラー(長さ・記号欄・文字種の組み合わせ)は、再生成を押す前から表示します。入力エラーのときは表示中のパスワードを残し、乱数のエラーのときは消します。
