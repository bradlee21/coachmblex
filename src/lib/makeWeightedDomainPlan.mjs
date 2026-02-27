const DOMAIN_CODES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];

function toSafeInt(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toSafeWeight(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sumCounts(countsByDomain, domainCodes) {
  return domainCodes.reduce((sum, code) => sum + (Number(countsByDomain?.[code]) || 0), 0);
}

export function makeWeightedDomainPlan(N, weights) {
  const target = toSafeInt(N);
  const normalizedWeights = {};
  const countsByDomain = {};
  const remaindersByDomain = {};
  const allocationRows = [];

  for (const domainCode of DOMAIN_CODES) {
    const weight = toSafeWeight(weights?.[domainCode]);
    normalizedWeights[domainCode] = weight;
    const exact = target * weight;
    const base = Math.floor(exact);
    const remainder = exact - base;
    countsByDomain[domainCode] = base;
    remaindersByDomain[domainCode] = remainder;
    allocationRows.push({ domainCode, weight, remainder });
  }

  let remaining = target - sumCounts(countsByDomain, DOMAIN_CODES);
  if (remaining > 0) {
    const rankedForAdd = [...allocationRows].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.domainCode.localeCompare(b.domainCode);
    });
    let index = 0;
    while (remaining > 0 && rankedForAdd.length > 0) {
      const domainCode = rankedForAdd[index % rankedForAdd.length].domainCode;
      countsByDomain[domainCode] += 1;
      remaining -= 1;
      index += 1;
    }
  } else if (remaining < 0) {
    const rankedForRemove = [...allocationRows].sort((a, b) => {
      if (a.remainder !== b.remainder) return a.remainder - b.remainder;
      if (a.weight !== b.weight) return a.weight - b.weight;
      return b.domainCode.localeCompare(a.domainCode);
    });
    let index = 0;
    let stalledRounds = 0;
    while (remaining < 0 && rankedForRemove.length > 0 && stalledRounds <= rankedForRemove.length) {
      const domainCode = rankedForRemove[index % rankedForRemove.length].domainCode;
      const before = countsByDomain[domainCode];
      while (countsByDomain[domainCode] > 0 && remaining < 0) {
        countsByDomain[domainCode] -= 1;
        remaining += 1;
      }
      stalledRounds = countsByDomain[domainCode] === before ? stalledRounds + 1 : 0;
      index += 1;
    }
  }

  return {
    countsByDomain,
    meta: {
      N: target,
      weights: normalizedWeights,
      remaindersByDomain,
      method: 'largest_remainder',
    },
  };
}
