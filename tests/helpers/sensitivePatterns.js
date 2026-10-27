"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// NOTE: 検索語をそのまま書くと、このファイル自体が検出されるため、部品をつないで作る
function _join(...parts) {
  return parts.join("");
}

const CREDENTIAL_PATTERNS = Object.freeze([
  { label: "汎用語(トークン)", regex: new RegExp(_join("to", "ken"), "i") },
  { label: "汎用語(シークレット)", regex: new RegExp(_join("sec", "ret"), "i") },
  { label: "汎用語(APIキー)", regex: new RegExp(_join("api", "[_-]?", "key"), "i") },
  { label: "秘密鍵", regex: new RegExp(_join("BEGIN [A-Z ]*", "PRIVATE", " KEY")) },
  { label: "GitHubの認証文字列", regex: new RegExp(_join("\\bgh", "[pousr]_[A-Za-z0-9]{20,}")) },
  { label: "GitHubの細粒度認証文字列", regex: new RegExp(_join("github", "_pat_")) },
  { label: "AWSのアクセスキー", regex: new RegExp(_join("AK", "IA[0-9A-Z]{16}")) },
  { label: "パスワードの代入", regex: new RegExp(_join("pass", "wd\\s*[=:]"), "i") },
]);

// ログに出た認証用の文字列を伏せるための正規表現
const AUTH_STRING_REGEX = new RegExp(_join("\\bgh", "[pousr]_[A-Za-z0-9]{20,}|", "github", "_pat_[A-Za-z0-9_]+"), "g");

const ALLOWED_EMAIL_DOMAINS = Object.freeze(["users.noreply.github.com", "example.com"]);
// コミットの共同作成者の行に使う、公開の送信専用アドレス
const ALLOWED_EMAIL_ADDRESSES = Object.freeze(["noreply@anthropic.com"]);
const ALLOWED_IP_ADDRESSES = Object.freeze(["127.0.0.1", "0.0.0.0"]);
const MAX_IPV4_OCTET = 255;
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IPV4_REGEX = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;

function _escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * このPCに固有の値(ホームディレクトリ、ユーザー名、PC名)の検出パターンを作る。
 * 値そのものはリポジトリに書かず、実行時に取得する。
 * @returns {{label: string, regex: RegExp}[]}
 */
function createLocalIdentityPatterns() {
  const homeDirectory = os.homedir();
  const patterns = [
    { label: "ホームディレクトリ", regex: new RegExp(_escapeRegex(homeDirectory), "i") },
    { label: "ホームディレクトリ(/区切り)", regex: new RegExp(_escapeRegex(homeDirectory.replace(/\\/g, "/")), "i") },
    { label: "PC名", regex: new RegExp(`\\b${_escapeRegex(os.hostname())}\\b`, "i") },
    { label: "Windowsのユーザーフォルダ", regex: /[A-Za-z]:[\\/]+Users[\\/]+/i },
  ];
  const userName = os.userInfo().username;
  if (userName) {
    const userNameRegex = new RegExp(`(?<![A-Za-z0-9])${_escapeRegex(userName)}(?![A-Za-z0-9])`, "i");
    patterns.push({ label: "ユーザー名", regex: userNameRegex });
  }
  return patterns;
}

function _findEmails(text) {
  return (text.match(EMAIL_REGEX) || []).filter((email) => {
    const domain = email.split("@")[1].toLowerCase();
    if (ALLOWED_EMAIL_ADDRESSES.includes(email.toLowerCase())) {
      return false;
    }
    return !ALLOWED_EMAIL_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
  });
}

function _findIpAddresses(text) {
  return (text.match(IPV4_REGEX) || []).filter((address) => {
    const isValidAddress = address.split(".").every((octet) => Number(octet) <= MAX_IPV4_OCTET);
    return isValidAddress && !ALLOWED_IP_ADDRESSES.includes(address);
  });
}

/**
 * テキスト中の検出結果を、行番号つきで返す(検出した値そのものは返さない)。
 * @param {string} text
 * @param {{label: string, regex: RegExp}[]} patterns
 * @param {{includePersonalFormats?: boolean}} [options] メール・IPアドレスも検査するか
 * @returns {{label: string, line: number}[]}
 */
function findSensitiveMatches(text, patterns, options = {}) {
  const findings = [];
  text.split(/\r?\n/).forEach((lineText, index) => {
    for (const { label, regex } of patterns) {
      if (regex.test(lineText)) {
        findings.push({ label, line: index + 1 });
      }
    }
    if (options.includePersonalFormats && _findEmails(lineText).length > 0) {
      findings.push({ label: "メールアドレス", line: index + 1 });
    }
    if (options.includePersonalFormats && _findIpAddresses(lineText).length > 0) {
      findings.push({ label: "IPアドレス", line: index + 1 });
    }
  });
  return findings;
}

const SKIPPED_DIRECTORIES = Object.freeze(["node_modules", ".git", ".mutation-tmp"]);
const BINARY_EXTENSIONS = Object.freeze([".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip"]);

/**
 * リポジトリ内のテキストファイルを列挙する(node_modules と .git は除く)。
 * @param {string} rootDirectory
 * @returns {string[]} ルートからの相対パス
 */
function listRepositoryTextFiles(rootDirectory) {
  const results = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory() && !SKIPPED_DIRECTORIES.includes(entry.name)) {
        visit(fullPath);
      } else if (entry.isFile() && !BINARY_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        results.push(path.relative(rootDirectory, fullPath).replace(/\\/g, "/"));
      }
    }
  };
  visit(rootDirectory);
  return results.sort();
}

module.exports = {
  AUTH_STRING_REGEX,
  CREDENTIAL_PATTERNS,
  createLocalIdentityPatterns,
  findSensitiveMatches,
  listRepositoryTextFiles,
};
