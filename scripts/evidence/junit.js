"use strict";

const fs = require("node:fs");

const XML_ENTITIES = Object.freeze({ "&quot;": "\"", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" });
const TEST_ID_REGEX = /\b([USIEP]-\d{2}[a-z]?)\b/;

function _decodeXml(text) {
  return text
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(quot|apos|lt|gt|amp);/g, (entity) => XML_ENTITIES[entity]);
}

function _readAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? _decodeXml(match[1]) : "";
}

function _resolveStatus(body) {
  if (/<(failure|error)\b/.test(body)) {
    return "fail";
  }
  return /<skipped\b/.test(body) ? "skipped" : "pass";
}

/**
 * node:test の JUnit 出力から、テストごとの結果を取り出す。
 * @param {string} filePath
 * @returns {{name: string, id: string | null, status: "pass" | "fail" | "skipped", skipReason: string}[]}
 */
function parseJunitFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const xml = fs.readFileSync(filePath, "utf8");
  const results = [];
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attributes = match[1];
    const body = match[2] || "";
    const name = _readAttribute(attributes, "name");
    const idMatch = name.match(TEST_ID_REGEX);
    const skipped = body.match(/<skipped\b[^>]*message="([^"]*)"/);
    results.push({
      name,
      id: idMatch ? idMatch[1] : null,
      status: _resolveStatus(body),
      skipReason: skipped ? _decodeXml(skipped[1]) : "",
    });
  }
  return results;
}

module.exports = { parseJunitFile, TEST_ID_REGEX };
