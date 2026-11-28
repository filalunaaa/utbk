'use strict';
const fs = require('node:fs');
const path = require('node:path');

const status = { textContent: '', className: '' };
const output = { innerHTML: '' };
const button = { disabled: false };
const root = {
  querySelector(selector) {
    if (selector === '#pse-status') return status;
    if (selector === '#pse-results') return output;
    return button;
  }
};
global.window = global;
global.ADMIN = false;
global.document = {
  getElementById(id) { return id === 'pytago-synth-panel' ? root : null; },
  documentElement: {}
};
global.MutationObserver = class { constructor(callback) {} observe() {} };

let seed = Number(process.env.SIM_SEED || 20261127) >>> 0;
Math.random = function seededRandom() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};

require(path.resolve(__dirname, '../js/synthetic-examinee-engine.js'));
const engine = global.PytagoSyntheticEngine;
if (!engine || typeof engine.runMisspecification !== 'function') {
  throw new Error('Monte Carlo API was not exposed by the engine');
}

const progress = setInterval(() => {
  process.stdout.write('[Monte Carlo] ' + (status.textContent || 'initializing') + '\n');
}, 15000);

(async () => {
  try {
    await engine.runMisspecification();
    const result = engine.getLatest();
    if (!result || result.schema !== 'pytago.irt.model-fit-monte-carlo.v5') {
      throw new Error('Simulation did not produce a valid v5 result. Status: ' + status.textContent);
    }
    if (result.total_fits !== 2700 || result.scenarios.length !== 27) {
      throw new Error('Unexpected simulation size: fits=' + result.total_fits + ', scenarios=' + result.scenarios.length);
    }
    const outDir = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'pytago-irt-model-fit-monte-carlo-v5.json');
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
    const convergence = result.scenarios.reduce((sum, x) => sum + x.converged_count, 0);
    console.log(JSON.stringify({
      status: 'completed',
      schema: result.schema,
      total_fits: result.total_fits,
      converged_fits: convergence,
      generated_at: result.generated_at,
      artifact: outFile
    }, null, 2));
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    clearInterval(progress);
  }
})();
