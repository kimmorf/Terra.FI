/**
 * Função para extrair o preço do token do campo example
 * Exemplo: "1 token = R$ 10,00" -> 10
 */
export function extractTokenPrice(example: string | null | undefined): number | null {
  if (!example) return null;

  // Procura por padrões como "R$ 10,00" ou "R$ 10.00" ou "10,00" ou "10.00"
  const patterns = [
    /R\$\s*(\d+[.,]\d+)/,  // R$ 10,00 ou R$ 10.00
    /R\$\s*(\d+)/,         // R$ 10
    /(\d+[.,]\d+)/,        // 10,00 ou 10.00
    /(\d+)/,               // 10
  ];

  for (const pattern of patterns) {
    const match = example.match(pattern);
    if (match) {
      const value = match[1].replace(',', '.');
      const price = parseFloat(value);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }
  }

  return null;
}

/**
 * Calcula quantos tokens enviar baseado no valor investido e no preço do token
 */
export function calculateTokenAmount(investmentAmount: number, tokenPrice: number | null): number {
  if (!tokenPrice || tokenPrice <= 0) {
    return 0;
  }
  return investmentAmount / tokenPrice;
}

