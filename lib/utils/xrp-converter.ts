import Decimal from 'decimal.js';

/**
 * Converte XRP para drops com precisão decimal
 */
export function xrpToDrops(xrp: string | number): string {
  const xrpDecimal = new Decimal(xrp);
  const dropsDecimal = xrpDecimal.times(1000000);
  return dropsDecimal.toFixed(0);
}

/**
 * Converte drops para XRP com precisão decimal
 */
export function dropsToXrp(drops: string | number): string {
  const dropsDecimal = new Decimal(drops);
  const xrpDecimal = dropsDecimal.div(1000000);
  return xrpDecimal.toString();
}

/**
 * Valida se um valor em XRP é válido
 */
export function isValidXRPAmount(amount: string | number): boolean {
  try {
    const decimal = new Decimal(amount);
    return decimal.gt(0) && decimal.lte(new Decimal('100000000000')); // Max supply
  } catch {
    return false;
  }
}

/**
 * Formata XRP para exibição
 */
export function formatXRP(amount: string | number, decimals: number = 6): string {
  try {
    const decimal = new Decimal(amount);
    return decimal.toFixed(decimals);
  } catch {
    return '0';
  }
}
