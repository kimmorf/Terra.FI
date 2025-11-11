/**
 * Sistema de Categorização e Reporte de Erros
 * 
 * Categoriza erros e gera arquivos ERROR_<CATEGORIA>.MD padronizados
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export type ErrorCategory =
  | 'TRANSFER'
  | 'LOGIN'
  | 'MPT_LOCK'
  | 'UI_STATE'
  | 'DEX'
  | 'COLLATERAL'
  | 'AUTH'
  | 'XRPL'
  | 'API'
  | 'DATABASE'
  | 'SECURITY'
  | 'UNKNOWN';

export interface ErrorReport {
  category: ErrorCategory;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  timestamp: string;
  context: Record<string, unknown>;
  stack?: string;
  userId?: string;
  walletAddress?: string;
  txHash?: string;
  network?: string;
  // Verificação de dados sensíveis
  containsSensitiveData: boolean;
  sensitiveFields?: string[];
}

/**
 * Detecta se o erro contém dados sensíveis
 */
export function detectSensitiveData(error: Error | string, context: Record<string, unknown>): {
  containsSensitiveData: boolean;
  sensitiveFields: string[];
} {
  const sensitivePatterns = [
    /secret/i,
    /password/i,
    /private[_-]?key/i,
    /api[_-]?key/i,
    /token/i,
    /credential/i,
    /seed/i,
    /mnemonic/i,
    /wallet[_-]?secret/i,
  ];

  const sensitiveFields: string[] = [];
  const errorStr = error instanceof Error ? JSON.stringify({ message: error.message, stack: error.stack }) : String(error);
  const contextStr = JSON.stringify(context);

  // Verifica no erro
  for (const pattern of sensitivePatterns) {
    if (pattern.test(errorStr)) {
      sensitiveFields.push('error_message');
      break;
    }
  }

  // Verifica no contexto
  for (const [key, value] of Object.entries(context)) {
    const valueStr = JSON.stringify(value);
    for (const pattern of sensitivePatterns) {
      if (pattern.test(key) || pattern.test(valueStr)) {
        sensitiveFields.push(key);
        break;
      }
    }
  }

  return {
    containsSensitiveData: sensitiveFields.length > 0,
    sensitiveFields,
  };
}

/**
 * Categoriza erro baseado no tipo e contexto
 */
export function categorizeError(
  error: Error | string,
  context: Record<string, unknown> = {}
): ErrorCategory {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();

  // Transfer/Payment
  if (
    errorLower.includes('transfer') ||
    errorLower.includes('payment') ||
    errorLower.includes('send') ||
    errorLower.includes('mptoken') ||
    context.operation === 'transfer' ||
    context.operation === 'payment'
  ) {
    return 'TRANSFER';
  }

  // Login/Auth
  if (
    errorLower.includes('login') ||
    errorLower.includes('session') ||
    errorLower.includes('token') ||
    errorLower.includes('crossmark') ||
    errorLower.includes('unauthorized') ||
    context.operation === 'login' ||
    context.operation === 'auth'
  ) {
    return 'LOGIN';
  }

  // MPT Lock (Freeze/Issue)
  if (
    errorLower.includes('freeze') ||
    errorLower.includes('lock') ||
    errorLower.includes('colateral') ||
    errorLower.includes('collateral') ||
    context.operation === 'freeze' ||
    context.operation === 'lock' ||
    context.operation === 'issue_col'
  ) {
    return 'MPT_LOCK';
  }

  // UI State
  if (
    errorLower.includes('ui') ||
    errorLower.includes('state') ||
    errorLower.includes('component') ||
    errorLower.includes('render') ||
    context.source === 'ui' ||
    context.source === 'frontend'
  ) {
    return 'UI_STATE';
  }

  // DEX
  if (
    errorLower.includes('dex') ||
    errorLower.includes('offer') ||
    errorLower.includes('order') ||
    errorLower.includes('trade') ||
    context.operation === 'dex' ||
    context.operation === 'offer'
  ) {
    return 'DEX';
  }

  // Collateral
  if (
    errorLower.includes('collateral') ||
    errorLower.includes('col') ||
    context.operation === 'collateral' ||
    context.tokenType === 'COL'
  ) {
    return 'COLLATERAL';
  }

  // Auth
  if (
    errorLower.includes('auth') ||
    errorLower.includes('permission') ||
    errorLower.includes('access') ||
    context.operation === 'auth'
  ) {
    return 'AUTH';
  }

  // XRPL
  if (
    errorLower.includes('xrpl') ||
    errorLower.includes('ripple') ||
    errorLower.includes('ledger') ||
    errorLower.includes('engine_result') ||
    context.source === 'xrpl'
  ) {
    return 'XRPL';
  }

  // API
  if (
    errorLower.includes('api') ||
    errorLower.includes('endpoint') ||
    errorLower.includes('request') ||
    context.source === 'api'
  ) {
    return 'API';
  }

  // Database
  if (
    errorLower.includes('database') ||
    errorLower.includes('prisma') ||
    errorLower.includes('query') ||
    context.source === 'database'
  ) {
    return 'DATABASE';
  }

  // Security
  if (
    errorLower.includes('security') ||
    errorLower.includes('unauthorized') ||
    errorLower.includes('forbidden') ||
    context.source === 'security'
  ) {
    return 'SECURITY';
  }

  return 'UNKNOWN';
}

/**
 * Gera relatório de erro formatado
 */
export function generateErrorReport(
  error: Error | string,
  context: Record<string, unknown> = {}
): ErrorReport {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const category = categorizeError(error, context);
  const sensitiveCheck = detectSensitiveData(error, context);

  // Determina severidade
  let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  
  if (sensitiveCheck.containsSensitiveData) {
    severity = 'CRITICAL';
  } else if (category === 'SECURITY' || category === 'AUTH') {
    severity = 'HIGH';
  } else if (category === 'TRANSFER' || category === 'MPT_LOCK') {
    severity = 'HIGH';
  } else if (category === 'UI_STATE') {
    severity = 'LOW';
  }

  return {
    category,
    severity,
    title: errorMessage.substring(0, 100),
    description: errorMessage,
    timestamp: new Date().toISOString(),
    context: {
      ...context,
      // Remove dados sensíveis do contexto
      ...(sensitiveCheck.containsSensitiveData && {
        _warning: 'Dados sensíveis detectados e removidos do contexto',
      }),
    },
    stack,
    userId: context.userId as string | undefined,
    walletAddress: context.walletAddress as string | undefined,
    txHash: context.txHash as string | undefined,
    network: context.network as string | undefined,
    containsSensitiveData: sensitiveCheck.containsSensitiveData,
    sensitiveFields: sensitiveCheck.sensitiveFields,
  };
}

/**
 * Gera arquivo ERROR_<CATEGORIA>.MD
 */
export async function writeErrorReport(report: ErrorReport): Promise<string> {
  const errorsDir = join(process.cwd(), 'docs', 'errors');
  
  // Cria diretório se não existir
  if (!existsSync(errorsDir)) {
    await mkdir(errorsDir, { recursive: true });
  }

  const filename = `ERROR_${report.category}.MD`;
  const filepath = join(errorsDir, filename);

  // Formata conteúdo do relatório
  const content = formatErrorReport(report);

  // Se arquivo existe, adiciona ao final
  let existingContent = '';
  if (existsSync(filepath)) {
    const { readFile } = await import('fs/promises');
    existingContent = await readFile(filepath, 'utf-8');
  }

  const newContent = existingContent 
    ? `${existingContent}\n\n---\n\n${content}`
    : content;

  await writeFile(filepath, newContent, 'utf-8');

  return filepath;
}

/**
 * Formata relatório em Markdown
 */
function formatErrorReport(report: ErrorReport): string {
  const { category, severity, title, description, timestamp, context, stack, 
          userId, walletAddress, txHash, network, containsSensitiveData, sensitiveFields } = report;

  return `# 🚨 ERROR_${category}

**Severidade:** ${severity}  
**Data/Hora:** ${timestamp}  
**Categoria:** ${category}

## Descrição

${description}

## Contexto

${Object.entries(context)
  .filter(([key]) => !key.startsWith('_'))
  .map(([key, value]) => `- **${key}:** ${JSON.stringify(value, null, 2)}`)
  .join('\n')}

${userId ? `- **User ID:** ${userId}` : ''}
${walletAddress ? `- **Wallet Address:** ${walletAddress}` : ''}
${txHash ? `- **Transaction Hash:** ${txHash}` : ''}
${network ? `- **Network:** ${network}` : ''}

${containsSensitiveData ? `
## ⚠️ AVISO: Dados Sensíveis Detectados

**Campos com dados sensíveis:**
${sensitiveFields?.map(field => `- ${field}`).join('\n')}

**Ação:** Dados sensíveis foram removidos do contexto para segurança.
` : ''}

${stack ? `
## Stack Trace

\`\`\`
${stack}
\`\`\`
` : ''}

## Ações Recomendadas

${getRecommendedActions(category, severity)}
`;
}

/**
 * Retorna ações recomendadas baseado na categoria e severidade
 */
function getRecommendedActions(category: ErrorCategory, severity: string): string {
  const actions: Record<ErrorCategory, string> = {
    TRANSFER: `
1. Verificar saldo da wallet
2. Verificar trustline do token
3. Verificar autorização (se necessário)
4. Consultar transação no explorer XRPL
5. Verificar logs do servidor para mais detalhes
`,
    LOGIN: `
1. Verificar se Crossmark está instalado e atualizado
2. Verificar se sessão não expirou
3. Tentar desconectar e reconectar wallet
4. Verificar configuração de autenticação
5. Verificar logs de autenticação
`,
    MPT_LOCK: `
1. Verificar se issuer tem permissão para freeze
2. Verificar se holder está autorizado
3. Verificar saldo disponível para lock
4. Consultar transação no explorer XRPL
5. Verificar logs de operação de lock
`,
    UI_STATE: `
1. Recarregar página
2. Limpar cache do navegador
3. Verificar console do navegador para erros JavaScript
4. Verificar estado do componente React
5. Reportar ao time de frontend
`,
    DEX: `
1. Verificar se oferta existe no ledger
2. Verificar saldo suficiente
3. Verificar trustlines necessárias
4. Consultar book de ofertas
5. Verificar logs de DEX
`,
    COLLATERAL: `
1. Verificar se LAND está congelado
2. Verificar se COL pode ser emitido
3. Verificar saldo de LAND disponível
4. Consultar transações relacionadas
5. Verificar logs de colateralização
`,
    AUTH: `
1. Verificar permissões do usuário
2. Verificar sessão válida
3. Verificar configuração de autenticação
4. Verificar logs de autorização
5. Contatar administrador se necessário
`,
    XRPL: `
1. Verificar conectividade com XRPL
2. Verificar status do ledger
3. Verificar engine_result específico
4. Consultar documentação XRPL
5. Verificar logs de conexão XRPL
`,
    API: `
1. Verificar se endpoint está disponível
2. Verificar formato da requisição
3. Verificar autenticação da API
4. Verificar logs do servidor
5. Verificar rate limiting
`,
    DATABASE: `
1. Verificar conectividade com banco
2. Verificar se query é válida
3. Verificar logs do Prisma
4. Verificar migrações pendentes
5. Contatar DBA se necessário
`,
    SECURITY: `
1. **CRÍTICO:** Verificar logs de segurança imediatamente
2. Verificar se há tentativa de acesso não autorizado
3. Verificar auditoria de flags
4. Notificar time de segurança
5. Revisar permissões e acessos
`,
    UNKNOWN: `
1. Coletar mais contexto do erro
2. Verificar logs completos
3. Verificar se é erro conhecido
4. Reportar ao time de desenvolvimento
5. Adicionar mais contexto para categorização
`,
  };

  return actions[category] || actions.UNKNOWN;
}

/**
 * Função helper para reportar erro facilmente
 */
export async function reportError(
  error: Error | string,
  context: Record<string, unknown> = {}
): Promise<string> {
  const report = generateErrorReport(error, context);
  const filepath = await writeErrorReport(report);
  
  // Log também no console
  console.error(`[ERROR_${report.category}] ${report.title}`);
  if (report.containsSensitiveData) {
    console.warn(`[SECURITY] Dados sensíveis detectados em erro ${report.category}`);
  }
  
  return filepath;
}
