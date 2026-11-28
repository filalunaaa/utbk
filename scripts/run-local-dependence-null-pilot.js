'use strict';
const fs = require('node:fs');
const path = require('node:path');

const status = { textContent: '', className: '' };
const output = { innerHTML: '' };
const controls = new Map();
const root = {
  querySelector(selector) {
    if (selector === '#pse-status') return status;
    if (selector === '#pse-results') return output;
    if (!controls.has(selector)) controls.set(selector, { disabled: false });
    return controls.get(selector);
  }
};
global.window = global;
global.ADMIN = false;
global.document = {
  getElementById(id) { return id === 'pytago-synth-panel' ? root : null; },
  documentElement: {}
};
global.MutationObserver = class { constructor(callback) {} observe() {} };

let seed = Number(process.env.SIM_SEED || 20261128) >>> 0;
Math.random = function seededRandom() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};

require(path.resolve(__dirname, '../js/synthetic-examinee-engine.js'));
const engine = global.PytagoSyntheticEngine;
if (!engine || typeof engine.runLocalDependenceNullValidation !== 'function') {
  throw new Error('Local-dependence null pilot API was not exposed');
}

const repetitions = Math.max(2, Number(process.env.SIM_REPS || 20));
const examinees = Math.max(100, Number(process.env.SIM_N || 500));
const progress = setInterval(() => {
  process.stdout.write('[Local-dependence null pilot] ' + (status.textContent || 'initializing') + '\n');
}, 10000);

(async () => {
  try {
    await engine.runLocalDependenceNullValidation({ repetitions, examinees });
    const result = engine.getLatest();
    if (!result || result.schema !== 'pytago.irt.local-dependence-null-monte-carlo.v1') {
      throw new Error('Pilot did not produce a valid result. Status: ' + status.textContent);
    }
    if (result.repetitions_requested !== repetitions || result.examinees !== examinees) {
      throw new Error('Unexpected pilot dimensions');
    }
    const outDir = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'pytago-local-dependence-null-pilot-v1.json');
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({
      status: 'completed',
      schema: result.schema,
      repetitions_requested: result.repetitions_requested,
      successful_repetitions: result.summary.successful_repetitions,
      examinees: result.examinees,
      null_quantile_95: result.summary.empirical_null_quantile_95_max_abs,
      artifact: outFile
    }, null, 2));
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    clearInterval(progress);
  }
})();
