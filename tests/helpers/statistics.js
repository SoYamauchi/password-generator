"use strict";

const GAMMA_EPSILON = 1e-14;
const GAMMA_MAX_ITERATIONS = 10000;
const TINY = 1e-300;
const BISECTION_ITERATIONS = 200;
const LANCZOS_COEFFICIENTS = Object.freeze([
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]);
const LANCZOS_G = 7;
const HALF = 0.5;

/**
 * ln Γ(x)(Lanczos 近似)。
 * @param {number} x 正の実数
 * @returns {number}
 */
function logGamma(x) {
  if (x < HALF) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const shifted = x - 1;
  let sum = 0.99999999999980993;
  LANCZOS_COEFFICIENTS.forEach((coefficient, index) => {
    sum += coefficient / (shifted + index + 1);
  });
  const t = shifted + LANCZOS_G + HALF;
  return HALF * Math.log(2 * Math.PI) + (shifted + HALF) * Math.log(t) - t + Math.log(sum);
}

function _lowerGammaSeries(a, x) {
  let term = 1 / a;
  let sum = term;
  for (let n = 1; n < GAMMA_MAX_ITERATIONS; n += 1) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * GAMMA_EPSILON) {
      break;
    }
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function _upperGammaContinuedFraction(a, x) {
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < GAMMA_MAX_ITERATIONS; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    d = Math.abs(d) < TINY ? TINY : d;
    c = b + an / c;
    c = Math.abs(c) < TINY ? TINY : c;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < GAMMA_EPSILON) {
      break;
    }
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/**
 * 正則化された上側不完全ガンマ関数 Q(a, x)。
 * @returns {number}
 */
function upperRegularizedGamma(a, x) {
  if (x <= 0) {
    return 1;
  }
  return x < a + 1 ? 1 - _lowerGammaSeries(a, x) : _upperGammaContinuedFraction(a, x);
}

/**
 * カイ二乗分布の上側確率(p 値)。
 * @param {number} statistic
 * @param {number} degreesOfFreedom
 * @returns {number}
 */
function chiSquarePValue(statistic, degreesOfFreedom) {
  return upperRegularizedGamma(degreesOfFreedom / 2, statistic / 2);
}

/**
 * 上側確率が alpha になる臨界値を二分法で求める。
 * @param {number} degreesOfFreedom
 * @param {number} alpha
 * @returns {number}
 */
function chiSquareCriticalValue(degreesOfFreedom, alpha) {
  let low = 0;
  let high = degreesOfFreedom + 100 * Math.sqrt(2 * degreesOfFreedom) + 100;
  for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
    const middle = (low + high) / 2;
    if (chiSquarePValue(middle, degreesOfFreedom) > alpha) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}

/**
 * 観測度数と期待度数から、カイ二乗適合度検定を行う。
 * @param {number[]} observed
 * @param {number[]} expected
 * @param {number} alpha 有意水準
 * @returns {{statistic: number, degreesOfFreedom: number, criticalValue: number,
 *   pValue: number, alpha: number, isAccepted: boolean}}
 */
function runChiSquareTest(observed, expected, alpha) {
  const statistic = observed.reduce((sum, count, index) => {
    const difference = count - expected[index];
    return sum + (difference * difference) / expected[index];
  }, 0);
  const degreesOfFreedom = observed.length - 1;
  const criticalValue = chiSquareCriticalValue(degreesOfFreedom, alpha);
  const pValue = chiSquarePValue(statistic, degreesOfFreedom);
  return { statistic, degreesOfFreedom, criticalValue, pValue, alpha, isAccepted: statistic <= criticalValue };
}

/**
 * 相補誤差関数(Numerical Recipes の erfcc。相対誤差 1.2e-7 未満)。
 * @param {number} x
 * @returns {number}
 */
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + HALF * z);
  const polynomial = -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418
    + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587
    + t * (-0.82215223 + t * 0.17087277))))))));
  const result = t * Math.exp(polynomial);
  return x >= 0 ? result : 2 - result;
}

const SIGNIFICANT_DIGITS = 8;

function _formatValue(value) {
  if (typeof value !== "number" || Number.isInteger(value)) {
    return value;
  }
  return Number(value.toPrecision(SIGNIFICANT_DIGITS));
}

/**
 * 統計値をログに出す。runEvidence.js が "[STAT]" で始まる行を statistics.log に集める。
 * @param {string} name
 * @param {object} values
 */
function logStatistic(name, values) {
  const formatted = Object.entries(values)
    .map(([key, value]) => `${key}=${_formatValue(value)}`)
    .join(" ");
  console.log(`[STAT] ${name} ${formatted}`);
}

module.exports = {
  logGamma,
  chiSquarePValue,
  chiSquareCriticalValue,
  runChiSquareTest,
  erfc,
  logStatistic,
};
