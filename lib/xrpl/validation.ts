/**
 * Validação de endereços XRPL
 * Formato: r[0-9a-zA-Z]{25,34}
 * Checksum: Base58 com checksum
 */

/**
 * Valida formato básico de endereço XRPL
 * @param address Endereço a validar
 * @returns true se o formato é válido
 */
export function isValidXRPLAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Formato básico: começa com 'r' seguido de 25-34 caracteres alfanuméricos
  const xrplAddressRegex = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/;
  
  if (!xrplAddressRegex.test(address)) {
    return false;
  }

  // Validação adicional: Base58 encoding
  // XRPL usa Base58 sem 0, O, I, l para evitar confusão
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  const addressWithoutPrefix = address.slice(1);
  
  if (!base58Regex.test(addressWithoutPrefix)) {
    return false;
  }

  // Verifica comprimento total (26-35 caracteres incluindo 'r')
  if (address.length < 26 || address.length > 35) {
    return false;
  }

  return true;
}

/**
 * Valida e sanitiza endereço XRPL
 * @param address Endereço a validar
 * @returns Endereço validado ou null se inválido
 */
export function validateAndSanitizeAddress(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }

  const trimmed = address.trim();
  
  if (!isValidXRPLAddress(trimmed)) {
    return null;
  }

  return trimmed;
}
