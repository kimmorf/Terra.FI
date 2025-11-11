/**
 * Helpers para conversão XRP
 */

export function xrpToDrops(xrp: string | number): string {
  const xrpNum = typeof xrp === 'string' ? parseFloat(xrp) : xrp;
  return (xrpNum * 1000000).toString();
}

export function dropsToXrp(drops: string | number): number {
  const dropsNum = typeof drops === 'string' ? parseFloat(drops) : drops;
  return dropsNum / 1000000;
}
