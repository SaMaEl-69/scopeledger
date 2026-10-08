import { describe, expect, it } from 'vitest';
import { calculate, formatMoney, formatPercent, Money, parseAmount } from '../src/domain/finance';
import { createWorkspace } from '../src/domain/operations';
import type { Baseline, ChangeTerms } from '../src/domain/types';

function evaluate(baseline: Partial<Baseline> = {}, terms: Partial<ChangeTerms> = {}) {
  const workspace = createWorkspace();
  return calculate(
    { ...workspace.projects[0].baseline, ...baseline },
    { ...workspace.changes[0], ...terms },
  );
}

type Rational = { numerator: bigint; denominator: bigint };
// Test-only exact fractions form an independent oracle, without Decimal.js rounding.
function rational(value: string): Rational {
  const [mantissa, exponentText = '0'] = value.toLowerCase().split('e');
  const fractionalDigits = mantissa.split('.')[1]?.length ?? 0;
  const numerator = BigInt(mantissa.replace('.', ''));
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };
  const scale = fractionalDigits - Number(exponentText);
  return scale >= 0
    ? { numerator, denominator: 10n ** BigInt(scale) }
    : { numerator: numerator * 10n ** BigInt(-scale), denominator: 1n };
}
function add(first: Rational, second: Rational): Rational {
  return {
    numerator: first.numerator * second.denominator + second.numerator * first.denominator,
    denominator: first.denominator * second.denominator,
  };
}
function subtract(first: Rational, second: Rational): Rational {
  return add(first, { ...second, numerator: -second.numerator });
}
function multiply(first: Rational, second: Rational): Rational {
  return {
    numerator: first.numerator * second.numerator,
    denominator: first.denominator * second.denominator,
  };
}
function divide(first: Rational, second: Rational): Rational {
  return {
    numerator: first.numerator * second.denominator,
    denominator: first.denominator * second.numerator,
  };
}
function ceilCurrency(value: Rational): string {
  if (value.numerator <= 0n) return '0.00';
  const cents = (value.numerator * 100n + value.denominator - 1n) / value.denominator;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}
function exactRecommendations(baseline: Baseline, terms: ChangeTerms) {
  const cost = subtract(
    add(multiply(rational(terms.hours), rational(terms.rate)), rational(terms.outside)),
    rational(terms.removed),
  );
  const remainder = subtract(rational('1'), divide(rational(baseline.target), rational('100')));
  return {
    changeFloor: ceilCurrency(divide(cost, remainder)),
    restorationFee: ceilCurrency(
      subtract(
        divide(add(add(rational(baseline.actual), rational(baseline.remaining)), cost), remainder),
        rational(baseline.fee),
      ),
    ),
  };
}

describe('shared decimal financial engine', () => {
  it('matches every result in the required $8,000 reference case', () => {
    expect(evaluate()).toMatchObject({
      valid: true,
      errors: {},
      currentMargin: '35',
      absorbedMargin: '28.5',
      changeFloor: '800.00',
      restorationFee: '800.00',
      agreedMargin: '35',
      grossCost: '520',
      netCost: '520',
      effectiveFee: '800',
      deferred: false,
      creditRequired: false,
    });
  });

  it('separates protecting additional work from restoring the whole project', () => {
    const result = evaluate({ actual: '3000' });
    expect(result.changeFloor).toBe('800.00');
    expect(result.restorationFee).toBe('2338.47');
    expect(new Money(result.agreedMargin!).lessThan(35)).toBe(true);
  });

  it('keeps a profitable baseline from adding an unnecessary project-restoration charge', () => {
    const result = evaluate({ actual: '1000' });
    expect(result.currentMargin).toBe('47.5');
    expect(result.changeFloor).toBe('800.00');
    expect(result.restorationFee).toBe('0.00');
    expect(new Money(result.agreedMargin!).gt(35)).toBe(true);
  });

  it('does not invent zero costs for unknown draft entries', () => {
    const result = evaluate({ actual: '' }, { outside: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.actual).toMatch(/unknown/);
    expect(result.errors.outside).toMatch(/unknown/);
    expect(result.currentMargin).toBeNull();
    expect(result.grossCost).toBeNull();
    expect(result.changeFloor).toBeNull();
    expect(result.agreedMargin).toBeNull();
  });

  it.each(['NaN', 'Infinity', '-Infinity', '12 USD', '-', '.', '8.', '8e', '1e999999999', '0x10'])(
    'rejects nonexecutable input %s',
    (value) => {
      expect(evaluate({}, { hours: value }).errors.hours).toBeTruthy();
      expect(evaluate({}, { hours: value }).grossCost).toBeNull();
    },
  );

  it.each(['fee', 'actual', 'remaining'] as const)('rejects negative baseline %s', (key) => {
    const result = evaluate({ [key]: '-1' });
    expect(result.errors[key === 'fee' ? 'baselineFee' : key]).toBeTruthy();
  });

  it.each(['hours', 'rate', 'outside', 'removed', 'fee', 'credit'] as const)(
    'rejects negative change %s',
    (key) => {
      expect(evaluate({}, { [key]: '-1' }).errors[key]).toBeTruthy();
    },
  );

  it.each(['-1', '100', '101', 'Infinity'])('rejects target margin %s', (target) => {
    const result = evaluate({ target });
    expect(result.errors.target).toBeTruthy();
    expect(result.currentMargin).toBe('35');
    expect(result.changeFloor).toBeNull();
  });

  it('accepts a 0% target and refuses a zero revenue denominator', () => {
    expect(evaluate({ target: '0' }).changeFloor).toBe('520.00');
    const result = evaluate({ fee: '0' });
    expect(result.errors.baselineFee).toBeTruthy();
    expect(result.currentMargin).toBeNull();
    expect(result.agreedMargin).toBeNull();
  });

  it('keeps a valid target very close to 100% from rounding its denominator to zero', () => {
    const target = `99.${'9'.repeat(90)}`;
    const result = evaluate({ target });
    expect(result.valid).toBe(true);
    expect(new Money(result.changeFloor!).isFinite()).toBe(true);
    expect(formatMoney(result.changeFloor)).not.toBe('—');
  });

  it('rounds recommended minimum fees upward, using decimals', () => {
    const result = evaluate({ target: '35' }, { hours: '0.1', rate: '0.2', outside: '0' });
    expect(result.grossCost).toBe('0.02');
    expect(result.changeFloor).toBe('0.04');
    expect(result.restorationFee).toBe('0.04');
  });

  it('retains tiny positive costs at an exact-target baseline before upward cent rounding', () => {
    const result = evaluate({}, { hours: '1e-85' });
    expect(result.valid).toBe(true);
    expect(result.grossCost).toBe('6.5e-84');
    expect(result.changeFloor).toBe('0.01');
    expect(result.restorationFee).toBe('0.01');
  });

  it('rounds up a tiny addition at an existing whole-cent recommendation boundary', () => {
    const result = evaluate({}, { outside: '1e-100' });
    expect(result.valid).toBe(true);
    expect(result.changeFloor).toBe('800.01');
    expect(result.restorationFee).toBe('800.01');
    const product = evaluate({}, { hours: '1e-100', rate: '1e-100' });
    expect(product.valid).toBe(true);
    expect(product.grossCost).toBe('1e-200');
    expect(product.changeFloor).toBe('0.01');
    expect(product.restorationFee).toBe('0.01');
  });

  it('keeps product tails through large cancellation before restoration is rounded upward', () => {
    const baseline: Partial<Baseline> = {
      fee: `1.${'0'.repeat(108)}5e18`,
      actual: '1e-91',
      remaining: '1e17',
      target: `89.${'9'.repeat(107)}5`,
    };
    const terms: Partial<ChangeTerms> = {
      hours: `1.${'0'.repeat(108)}1e-100`,
      rate: `2.5${'0'.repeat(107)}25e-100`,
      outside: '1e17',
      removed: '1e17',
      removedScope: 'Remove the eligible remaining production cost',
    };
    const w = createWorkspace();
    const approved = { ...w.projects[0].baseline, ...baseline };
    const change = { ...w.changes[0], ...terms };
    const expected = exactRecommendations(approved, change);
    expect(expected.restorationFee).toBe('0.01');
    expect(calculate(approved, change)).toMatchObject({ valid: true, ...expected });
  });

  it('matches an exact rational cent oracle across supported extreme inputs and repeating quotients', () => {
    const w = createWorkspace();
    const values = ['1e-100', `1.${'0'.repeat(108)}1e-100`, '0.01', '65.01', '1e24'];
    const targets = ['0', '35', `99.${'9'.repeat(117)}`, '1e-100'];
    for (const hours of values)
      for (const rate of values)
        for (const target of targets) {
          const baseline = { ...w.projects[0].baseline, target };
          const change = { ...w.changes[0], hours, rate, outside: '1e-100' };
          const result = calculate(baseline, change);
          expect(result.valid).toBe(true);
          expect(result).toMatchObject(exactRecommendations(baseline, change));
        }
  });

  it('enforces the executable magnitude boundary without treating nonzero underflow as zero', () => {
    for (const text of ['0', '-0', '0e-999999999999999999', '1e-100', '1.01e-100', '1e24']) {
      const errors = {};
      expect(parseAmount(text, 'amount', errors, 'Amount')).not.toBeNull();
      expect(errors).toEqual({});
    }
    for (const text of ['1e-101', '9.99e-101', '1e-999999999999999999']) {
      const errors: Record<string, string> = {};
      expect(parseAmount(text, 'amount', errors, 'Amount')).toBeNull();
      expect(errors.amount).toMatch(/zero or at least/);
    }
    const negative: Record<string, string> = {};
    expect(parseAmount('-1e-999999999999999999', 'amount', negative, 'Amount')).toBeNull();
    expect(negative.amount).toMatch(/negative/);
    const overflow: Record<string, string> = {};
    expect(parseAmount('1.000000000000000001e24', 'amount', overflow, 'Amount')).toBeNull();
    expect(overflow.amount).toMatch(/no greater/);
  });

  it('preserves exact fractional hours and loaded-cost multiplication', () => {
    expect(evaluate({}, { hours: '3.25', rate: '65.01' }).grossCost).toBe('211.2825');
  });

  it('does not conceal a negative contribution margin', () => {
    expect(evaluate({ actual: '9000', remaining: '3200' }).currentMargin).toBe('-52.5');
    expect(formatPercent('-52.5')).toBe('-52.5%');
  });

  it('removes only explicit eligible remaining scope', () => {
    expect(evaluate({}, { removed: '100' }).errors.removedScope).toBeTruthy();
    expect(
      evaluate({}, { removed: '3200.01', removedScope: 'Approved listing page' }).errors.removed,
    ).toBeTruthy();
    expect(evaluate({}, { removed: '100', removedScope: 'Approved listing page' }).netCost).toBe(
      '420',
    );
  });

  it('allows a negative net change cost without silently creating a credit', () => {
    const result = evaluate(
      {},
      { removed: '600', removedScope: 'Remove an approved collection', fee: '0' },
    );
    expect(result.valid).toBe(true);
    expect(result.netCost).toBe('-80');
    expect(result.changeFloor).toBe('0.00');
    expect(result.restorationFee).toBe('0.00');
    expect(result.effectiveFee).toBe('0');
    expect(result.creditRequired).toBe(true);
  });

  it('requires explicit credit evidence and leaves positive project revenue', () => {
    expect(evaluate({}, { credit: '1000' }).errors.creditReason).toBeTruthy();
    const credit = evaluate({}, { credit: '1000', creditReason: 'Accepted scope reduction' });
    expect(credit.valid).toBe(true);
    expect(credit.effectiveFee).toBe('-200');
    expect(credit.creditRequired).toBe(true);
    expect(
      evaluate({}, { fee: '0', credit: '8000', creditReason: 'Full credit' }).errors.credit,
    ).toBeTruthy();
  });

  it('absorption has zero additional fee and retains the delivery cost', () => {
    const result = evaluate({}, { route: 'Absorb', fee: '' });
    expect(result.valid).toBe(true);
    expect(result.effectiveFee).toBe('0');
    expect(result.agreedMargin).toBe('28.5');
    expect(result.netCost).toBe('520');
    expect(
      evaluate({}, { route: 'Absorb', credit: '1', creditReason: 'Refund' }).errors.credit,
    ).toBeTruthy();
  });

  it('deferral leaves financial effects uncommitted while retaining estimates', () => {
    const result = evaluate({}, { route: 'Defer' });
    expect(result).toMatchObject({
      currentMargin: '35',
      deferred: true,
      grossCost: '520',
      netCost: '520',
      absorbedMargin: null,
      changeFloor: null,
      restorationFee: null,
      agreedMargin: null,
      effectiveFee: null,
    });
  });

  it('formats supported currencies without currency conversion or float loss', () => {
    expect(formatMoney('8000', 'USD')).toBe('$8,000.00');
    expect(formatMoney('8000', 'GBP')).toBe('£8,000.00');
    expect(formatMoney('8000', 'EUR')).toBe('€8,000.00');
    expect(formatMoney('8000', 'CAD')).toBe('CA$8,000.00');
    expect(formatMoney('8000', 'AUD')).toBe('A$8,000.00');
    expect(formatMoney('9007199254740993.01')).toBe('$9,007,199,254,740,993.01');
    expect(formatMoney('-100.005')).toBe('-$100.01');
    expect(formatMoney(null)).toBe('—');
    expect(formatPercent(null)).toBe('—');
  });
});
