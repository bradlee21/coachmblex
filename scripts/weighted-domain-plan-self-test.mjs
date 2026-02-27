import assert from 'node:assert/strict';
import { makeWeightedDomainPlan } from '../src/lib/makeWeightedDomainPlan.mjs';

const WEIGHTS = {
  D1: 0.11,
  D2: 0.12,
  D3: 0.14,
  D4: 0.15,
  D5: 0.17,
  D6: 0.16,
  D7: 0.15,
};

function sumCounts(countsByDomain) {
  return Object.values(countsByDomain || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
}

const expected100 = {
  D1: 11,
  D2: 12,
  D3: 14,
  D4: 15,
  D5: 17,
  D6: 16,
  D7: 15,
};

const plan100 = makeWeightedDomainPlan(100, WEIGHTS);
assert.deepEqual(plan100.countsByDomain, expected100);
assert.equal(sumCounts(plan100.countsByDomain), 100);

const plan10a = makeWeightedDomainPlan(10, WEIGHTS);
const plan10b = makeWeightedDomainPlan(10, WEIGHTS);
assert.equal(sumCounts(plan10a.countsByDomain), 10);
assert.deepEqual(plan10a.countsByDomain, plan10b.countsByDomain);

console.log('weighted-domain-plan-self-test: pass');
console.log(`N=100 => ${JSON.stringify(plan100.countsByDomain)}`);
console.log(`N=10 => ${JSON.stringify(plan10a.countsByDomain)}`);
