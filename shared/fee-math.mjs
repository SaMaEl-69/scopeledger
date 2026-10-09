import Decimal from 'decimal.js';
const Amount = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });

/** Inclusive prices retain the entered total, including at half-cent boundaries. */
export function feeAmounts(amount, rate = '0', mode = 'excluding-tax') {
  const fee = new Amount(amount),
    taxRate = new Amount(rate);
  if (mode === 'including-tax') {
    const subtotal = fee.div(new Amount(1).plus(taxRate.div(100))).toDecimalPlaces(2);
    return {
      subtotal: subtotal.toFixed(2),
      tax: fee.minus(subtotal).toFixed(2),
      total: fee.toFixed(2),
    };
  }
  const tax = fee.times(taxRate).div(100).toDecimalPlaces(2);
  return { subtotal: fee.toFixed(2), tax: tax.toFixed(2), total: fee.plus(tax).toFixed(2) };
}
