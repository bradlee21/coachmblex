export const DOMAIN_LABEL_BY_CODE = Object.freeze({
  D1: 'Anatomy & Physiology',
  D2: 'Kinesiology',
  D3: 'Pathology / Contraindications / Special Populations',
  D4: 'Benefits & Physiological Effects',
  D5: 'Professional Practice / Ethics',
  D6: 'Client Assessment / Intake',
  D7: 'Treatment Planning / Techniques',
});

function toText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeDomainCode(value) {
  const text = toText(value).toUpperCase();
  return DOMAIN_LABEL_BY_CODE[text] ? text : '';
}

export function inferDomainCodeFromPackId(packId) {
  const match = toText(packId).match(/^mblex-d([1-7])-/i);
  return match ? `D${match[1]}` : '';
}

export function inferPackDomainCode(pack, packId = '') {
  const metaDomainCode = normalizeDomainCode(pack?.meta?.domain_code);
  if (metaDomainCode) return metaDomainCode;

  const firstQuestionDomainCode = normalizeDomainCode(
    pack?.questions?.[0]?.domain_code || pack?.questions?.[0]?.domainCode
  );
  if (firstQuestionDomainCode) return firstQuestionDomainCode;

  const idCandidate =
    toText(packId) ||
    toText(pack?.pack_id) ||
    toText(pack?.packId) ||
    toText(pack?.id) ||
    toText(pack?.meta?.id);
  return inferDomainCodeFromPackId(idCandidate);
}

export function resolvePackDomainLabel(pack, domainCode, fallbackLabel = '') {
  const explicit = toText(pack?.meta?.domain_label);
  if (explicit) return explicit;

  const mapped = DOMAIN_LABEL_BY_CODE[normalizeDomainCode(domainCode)];
  if (mapped) return mapped;

  return toText(fallbackLabel);
}
