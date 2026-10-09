import Decimal from 'decimal.js';
import type { Baseline, ChangeTerms, Currency } from './types';
import { feeAmounts } from '../../shared/fee-math.mjs';
import { deliveryDays } from './delivery';

// Inputs span 10⁻¹⁰⁰…10²⁴ and at most 120 characters: scalar units are no smaller
// than 10⁻²¹⁹, and product units no smaller than 10⁻⁴³⁸. Exact products/sums need
// fewer than 490 digits. Restoration's repeating quotient must distinguish gaps
// as small as 10⁻⁶⁵⁷ from F plus a cent boundary; 1024 digits leave ample headroom
// at the maximum quotient magnitude (<10¹⁷⁰), including large cancellation.
// Draft text remains separate from executable numeric data and is never rewritten.
export const Money = Decimal.clone({ precision: 1024, rounding: Decimal.ROUND_HALF_UP });

export interface Calculation {
  valid: boolean;
  errors: Record<string, string>;
  currentMargin: string | null;
  absorbedMargin: string | null;
  changeFloor: string | null;
  restorationFee: string | null;
  agreedMargin: string | null;
  grossCost: string | null;
  netCost: string | null;
  effectiveFee: string | null;
  creditRequired: boolean;
  deferred: boolean;
}

/** Reject blank, unfinished, nonfinite and negative entries without coercion. */
export function parseAmount(
  value: string,
  key: string,
  errors: Record<string, string>,
  label: string,
): Decimal | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    errors[key] = `Enter ${label.toLowerCase()}; an unknown amount is not zero.`;
    return null;
  }
  if (text.length > 120 || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    errors[key] = `Enter a finite number for ${label.toLowerCase()}.`;
    return null;
  }
  try {
    const number = new Money(text);
    // Bound the exponent to keep malicious or corrupt draft strings from
    // expanding into gigabytes when rendered. This is a disclosed input limit.
    if (!number.isFinite() || number.abs().greaterThan('1e24')) {
      errors[key] = `${label} must be finite and no greater than 10²⁴.`;
      return null;
    }
    const nonzeroMantissa = /[1-9]/.test(text.split(/e/i, 1)[0]);
    // Decimal.js can underflow an extreme exponent to signed zero. Check the
    // original mantissa so that a negative or nonzero entry never becomes zero.
    if ((number.isNegative() && !number.isZero()) || (text.startsWith('-') && nonzeroMantissa)) {
      errors[key] = `${label} cannot be negative.`;
      return null;
    }
    if ((number.isZero() && nonzeroMantissa) || (!number.isZero() && number.lessThan('1e-100'))) {
      errors[key] = `${label} must be zero or at least 10⁻¹⁰⁰. Smaller entries stay as drafts.`;
      return null;
    }
    return number;
  } catch {
    errors[key] = `Enter a finite number for ${label.toLowerCase()}.`;
    return null;
  }
}

const percent = (value: Decimal) => value.times(100).toString();
const minimumFee = (value: Decimal) =>
  Money.max(0, value).toDecimalPlaces(2, Decimal.ROUND_CEIL).toFixed(2);

export function validFeeTaxRate(value: string): boolean {
  return value.length <= 120 && /^\d+(?:\.\d{1,2})?$/.test(value) && new Money(value).lte(100);
}

/** Tax edits preserve the before-tax fee and credit, rather than consuming margin. */
export function feeTaxPatch(change: ChangeTerms, taxRate: string): Partial<ChangeTerms> {
  const patch: Partial<ChangeTerms> = { taxRate };
  if (
    change.feeMode !== 'including-tax' ||
    !validFeeTaxRate(taxRate) ||
    !validFeeTaxRate(change.taxRate ?? '0') ||
    new Money(taxRate).eq(change.taxRate ?? '0')
  )
    return patch;
  const errors: Record<string, string> = {};
  for (const key of ['fee', 'credit'] as const) {
    const amount = parseAmount(change[key], key, errors, key);
    if (!amount || !amount.eq(amount.toDecimalPlaces(2))) continue;
    const net = feeAmounts(amount.toString(), change.taxRate ?? '0', 'including-tax').subtotal;
    const total = feeAmounts(net, taxRate).total;
    patch[key] = total;
  }
  return patch;
}

export function feeBasisPatch(
  change: ChangeTerms,
  mode: NonNullable<ChangeTerms['feeMode']>,
): Partial<ChangeTerms> {
  const patch: Partial<ChangeTerms> = { feeMode: mode };
  const inclusiveBefore = change.feeMode === 'including-tax',
    inclusiveAfter = mode === 'including-tax';
  const errors: Record<string, string> = {};
  const tax = parseAmount(change.taxRate ?? '0', 'taxRate', errors, 'Tax percentage');
  if (inclusiveBefore === inclusiveAfter || !tax || tax.gt(100) || !tax.eq(tax.toDecimalPlaces(2)))
    return patch;
  for (const key of ['fee', 'credit'] as const) {
    const amount = parseAmount(change[key], key, errors, key);
    if (amount && amount.eq(amount.toDecimalPlaces(2))) {
      const parts = feeAmounts(
        amount.toString(),
        tax.toString(),
        inclusiveBefore ? 'including-tax' : 'excluding-tax',
      );
      patch[key] = inclusiveAfter ? parts.total : parts.subtotal;
    }
  }
  return patch;
}

export function calculate(baseline: Baseline, change: ChangeTerms): Calculation {
  const errors: Record<string, string> = {};
  const F = parseAmount(baseline.fee, 'baselineFee', errors, 'Approved project fee');
  const A = parseAmount(baseline.actual, 'actual', errors, 'Actual delivery cost');
  const R = parseAmount(baseline.remaining, 'remaining', errors, 'Remaining delivery cost');
  const target = parseAmount(baseline.target, 'target', errors, 'Target margin');
  const H = parseAmount(change.hours, 'hours', errors, 'Additional hours');
  const L = parseAmount(change.rate, 'rate', errors, 'Loaded hourly delivery cost');
  const O = parseAmount(change.outside, 'outside', errors, 'Outside costs');
  const S = parseAmount(change.removed, 'removed', errors, 'Removed future cost');
  const fee =
    change.route === 'Absorb'
      ? new Money(0)
      : parseAmount(change.fee, 'fee', errors, 'Proposed additional fee');
  const credit = parseAmount(change.credit, 'credit', errors, 'Client credit');
  const taxRate = parseAmount(change.taxRate ?? '0', 'taxRate', errors, 'Tax percentage');
  if (
    taxRate &&
    (!/^\d+(?:\.\d{1,2})?$/.test(change.taxRate ?? '0') ||
      taxRate.gt(100) ||
      !taxRate.eq(taxRate.toDecimalPlaces(2)))
  )
    errors.taxRate = 'Enter a tax percentage from 0 to 100 with at most two decimal places.';
  if (
    change.feeMode !== undefined &&
    !['excluding-tax', 'including-tax', 'custom'].includes(change.feeMode)
  )
    errors.feeMode = 'Choose a valid fee basis.';
  if (deliveryDays(change.additionalDays) === null)
    errors.additionalDays = 'Enter whole calendar days from 0 to 3,650.';
  if (change.feeMode === 'including-tax' && fee && !fee.eq(fee.toDecimalPlaces(2)))
    errors.fee = 'Enter the tax-inclusive total in whole currency cents.';
  if (change.feeMode === 'including-tax' && credit && !credit.eq(credit.toDecimalPlaces(2)))
    errors.credit = 'Enter the tax-inclusive credit in whole currency cents.';
  if (F?.isZero()) errors.baselineFee = 'Approved project fee must be greater than zero.';
  if (target?.greaterThanOrEqualTo(100))
    errors.target = 'Target margin must be at least 0% and less than 100%.';
  if (S && R && S.greaterThan(R))
    errors.removed = 'Remove only eligible future cost, up to the current remaining forecast.';
  if (S?.greaterThan(0) && !change.removedScope.trim())
    errors.removedScope = 'Describe the approved scope being removed.';
  if (credit?.greaterThan(0) && !change.creditReason.trim())
    errors.creditReason = 'Record why the client is receiving a credit.';
  if (change.route === 'Absorb' && credit?.greaterThan(0))
    errors.credit =
      'Absorb has no additional fee. Choose Quote or Exchange to record a client credit.';
  const adjustment = fee && credit ? fee.minus(credit) : null;
  const Q =
    adjustment && taxRate && !errors.taxRate && !errors.fee && change.feeMode === 'including-tax'
      ? new Money(feeAmounts(adjustment.toString(), taxRate.toString(), 'including-tax').subtotal)
      : adjustment;
  if (Q && F && F.plus(Q).lessThanOrEqualTo(0))
    errors.credit = 'The credit must leave positive total project revenue.';

  const gross = H && L && O ? H.times(L).plus(O) : null;
  const cost = gross && S && !errors.removed && !errors.removedScope ? gross.minus(S) : null;
  const baselineValid = F && !errors.baselineFee && A && R;
  const targetValid = target && !errors.target;
  // Subtract before division, so a target extremely close to 100% cannot
  // round to 1 and accidentally introduce a zero denominator.
  const targetRemainder = targetValid ? new Money(100).minus(target).div(100) : null;
  const deferred = change.route === 'Defer';
  const executableFee =
    Q &&
    !errors.fee &&
    !errors.credit &&
    !errors.creditReason &&
    !errors.taxRate &&
    !errors.feeMode;
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    currentMargin: baselineValid ? percent(F.minus(A).minus(R).div(F)) : null,
    absorbedMargin:
      !deferred && baselineValid && cost ? percent(F.minus(A).minus(R).minus(cost).div(F)) : null,
    changeFloor:
      !deferred && cost && targetRemainder ? minimumFee(cost.div(targetRemainder)) : null,
    restorationFee:
      !deferred && baselineValid && cost && targetRemainder
        ? minimumFee(A.plus(R).plus(cost).div(targetRemainder).minus(F))
        : null,
    agreedMargin:
      !deferred && baselineValid && cost && executableFee
        ? percent(F.plus(Q).minus(A).minus(R).minus(cost).div(F.plus(Q)))
        : null,
    grossCost: gross?.toString() ?? null,
    netCost: cost?.toString() ?? null,
    effectiveFee: !deferred && executableFee ? Q.toString() : null,
    creditRequired: Boolean(
      (cost?.isNegative() && !cost.isZero()) || (Q?.isNegative() && !Q.isZero()),
    ),
    deferred,
  };
}

export function formatMoney(
  value: string | number | null | undefined,
  currency: Currency = 'USD',
): string {
  if (value === null || value === undefined || value === '') return '—';
  try {
    const amount = new Money(value);
    if (!amount.isFinite() || amount.abs().greaterThan('1e200')) return '—';
    const [integer, cents] = amount.abs().toFixed(2).split('.');
    const symbol =
      new Intl.NumberFormat('en-US', { style: 'currency', currency })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? currency;
    return `${amount.isNegative() && !amount.isZero() ? '-' : ''}${symbol}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
  } catch {
    return '—';
  }
}

export function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  try {
    const amount = new Money(value);
    if (!amount.isFinite()) return '—';
    return `${amount.toDecimalPlaces(2).toString()}%`;
  } catch {
    return '—';
  }
}
