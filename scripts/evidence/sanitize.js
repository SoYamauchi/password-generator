"use strict";

const os = require("node:os");

function _escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * エビデンスに書く前に、このPC固有の値(ホームのパス・ユーザー名・PC名)を伏せる。
 * @param {string} text
 * @returns {string}
 */
function sanitizeText(text) {
  const homeDirectory = os.homedir();
  const replacements = [
    [new RegExp(_escapeRegex(homeDirectory), "gi"), "<HOME>"],
    [new RegExp(_escapeRegex(homeDirectory.replace(/\\/g, "/")), "gi"), "<HOME>"],
    [new RegExp(_escapeRegex(homeDirectory.replace(/\\/g, "\\\\")), "gi"), "<HOME>"],
    [new RegExp(`\\b${_escapeRegex(os.hostname())}\\b`, "gi"), "<HOST>"],
  ];
  const userName = os.userInfo().username;
  if (userName) {
    replacements.push([new RegExp(`(?<![A-Za-z0-9])${_escapeRegex(userName)}(?![A-Za-z0-9])`, "gi"), "<USER>"]);
  }
  return replacements.reduce((result, [regex, replacement]) => result.replace(regex, replacement), text);
}

module.exports = { sanitizeText };
