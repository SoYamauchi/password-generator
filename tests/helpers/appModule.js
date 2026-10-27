"use strict";

const path = require("node:path");

// ミューテーション確認では、PG_APP_DIR に不良版を置いた一時ディレクトリを指定する
const APP_DIRECTORY = process.env.PG_APP_DIR
  ? path.resolve(process.env.PG_APP_DIR)
  : path.resolve(__dirname, "..", "..");

/**
 * テスト対象の生成ロジックを読み込む。
 * @returns {object}
 */
function loadGenerator() {
  return require(path.join(APP_DIRECTORY, "passwordGenerator.js"));
}

module.exports = { APP_DIRECTORY, loadGenerator };
