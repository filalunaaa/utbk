'use strict';
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
global.ADMIN = false;
global.document = { documentElement: {}, getElementById() { return null; } };
global.MutationObserver = class { constructor() {} observe() {} };

let seed = Number(process.env.SIM_SEED || 20261128) >>> 0;
Math.random = function seededRandom() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};

require(path.resolve(__dirname, '../js/synthetic-examinee-engine.js'));
const engine = global.PytagoSyntheticEngine;
if (!engine || typeof engine.runLocalDependenceAlternativePilot !== 'function') {
  throw new Error('Local-dependence alternative pilot API was not exposed');
}

const repetitions = Math.max(4, Number(process.env.SIM_REPS || 20));
const examinees = Math.max(100, Number(process.env.SIM_N || 500));
const strengths = (process.env.SIM_STRENGTHS || '0.35,0.70').split(',').map(Number);

(async () => {
  const result = await engine.runLocalDependenceAlternativePilot({ repetitions, examinees, strengths });
  if (!result || result.schema !== 'pytago.irt.local-dependence-testlet-pilot.v1') {
    throw new Error('Pilot returned an unexpected schema');
  }
  if (result.calibration.requested !== repetitions ||
      result.null_validation.requested !== repetitions ||
      Object.values(result.alternatives).some(x => x.requested !== repetitions)) {
    throw new Error('Unexpected calibration/validation dimensions');
  }
  const outDir = path.resolve(__dirname, '../artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'pytago-local-dependence-testlet-pilot-v1.json');
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({
    status: 'completed',
    schema: result.schema,
    examinees: result.examinees,
    item_count: result.item_count,
    calibration: result.calibration,
    null_validation: result.null_validation,
    alternatives: result.alternatives,
    artifact: outFile
  }, null, 2));
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
