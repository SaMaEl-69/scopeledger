const allowed = [
  'licenseId',
  'deviceId',
  'operator',
  'purchaseOwnershipVerified',
  'independentReceiptReference',
  'verificationChannel',
  'evidence',
];
const fail = () => {
  throw new Error(
    'Recovery evidence must contain valid license/device identifiers, bounded text and independently verified purchase ownership. Private evidence is never included in errors.',
  );
};
const boundedText = (value, limit, optional = false) =>
  typeof value === 'string' && value.length <= limit && (optional || value.trim().length > 0);

/** Validate trusted operator input; this does not itself verify an external receipt. */
export function validateRecoveryEvidence(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    typeof input.licenseId !== 'string' ||
    typeof input.deviceId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.licenseId ?? '') ||
    !/^[a-f0-9]{64}$/.test(input.deviceId ?? '') ||
    input.purchaseOwnershipVerified !== true ||
    !boundedText(input.operator, 200) ||
    !boundedText(input.independentReceiptReference, 1000) ||
    !boundedText(input.verificationChannel, 200) ||
    (input.evidence !== undefined && !boundedText(input.evidence, 10000, true))
  )
    fail();
  const channel = input.verificationChannel.trim();
  if (/^shared(?:[-_\s]+)?key$/i.test(channel)) fail();
  const evidence = `Receipt: ${input.independentReceiptReference.trim()}; channel: ${channel}; ${input.evidence?.trim() ?? ''}`;
  if (evidence.length > 10000 || evidence.trim().length < 30) fail();
  return {
    licenseId: input.licenseId,
    deviceId: input.deviceId,
    operator: input.operator.trim(),
    evidence,
  };
}
