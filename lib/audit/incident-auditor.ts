/**
 * 🛡️ AGENTE: SEGURANÇA & COMPLIANCE
 * 
 * Auditoria de Incidentes Críticos
 * 
 * Valida erros críticos, detecta vazamento de dados sensíveis,
 * e gera post-mortem padronizado.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { generateErrorReport, type ErrorReport, detectSensitiveData } from '../errors/error-categorizer';
import { createHash } from 'crypto';

export interface IncidentReport {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  title: string;
  description: string;
  // Timeline
  detectedAt: string;
  resolvedAt?: string;
  duration?: number; // em minutos
  // Causa raiz
  rootCause: string;
  // Impacto
  impact: {
    usersAffected?: number;
    transactionsBlocked?: number;
    dataExposed?: boolean;
    financialImpact?: string;
    description: string;
  };
  // Ações tomadas
  actionsTaken: string[];
  // Ação preventiva
  preventiveAction: string;
  // Verificações de segurança
  securityChecks: {
    containsSensitiveData: boolean;
    sensitiveFields?: string[];
    dataLeaked: boolean;
    keysExposed: boolean;
    secretsExposed: boolean;
  };
  // Assinatura digital (hash do relatório)
  signature: string;
  // Metadata
  metadata: {
    errorReport?: ErrorReport;
    txHashes?: string[];
    walletAddresses?: string[];
    userIds?: string[];
    network?: string;
  };
}

/**
 * Valida se erro é crítico
 */
export function isCriticalError(error: Error | string, context: Record<string, unknown>): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();

  // Erros críticos:
  // 1. Bloqueio de transação
  const blocksTransaction = 
    errorLower.includes('transaction failed') ||
    errorLower.includes('engine_result') ||
    errorLower.includes('blocked') ||
    context.transactionBlocked === true;

  // 2. Vazamento de dados sensíveis
  const sensitiveCheck = detectSensitiveData(error, context);
  const dataLeaked = sensitiveCheck.containsSensitiveData;

  // 3. Erros de segurança
  const securityError =
    errorLower.includes('unauthorized') ||
    errorLower.includes('forbidden') ||
    errorLower.includes('security') ||
    context.securityIssue === true;

  // 4. Erros de autenticação críticos
  const authCritical =
    (errorLower.includes('login') || errorLower.includes('auth')) &&
    (errorLower.includes('failed') || errorLower.includes('invalid'));

  return blocksTransaction || dataLeaked || securityError || authCritical;
}

/**
 * Valida se log contém dados sensíveis
 */
export function validateLogForSensitiveData(
  error: Error | string,
  context: Record<string, unknown>
): {
  containsSensitiveData: boolean;
  dataLeaked: boolean;
  keysExposed: boolean;
  secretsExposed: boolean;
  sensitiveFields: string[];
} {
  const sensitiveCheck = detectSensitiveData(error, context);
  
  const keyPatterns = [
    /private[_-]?key/i,
    /secret[_-]?key/i,
    /api[_-]?key/i,
    /wallet[_-]?secret/i,
  ];

  const secretPatterns = [
    /secret/i,
    /password/i,
    /token/i,
    /credential/i,
    /seed/i,
    /mnemonic/i,
  ];

  const errorStr = error instanceof Error ? JSON.stringify({ message: error.message, stack: error.stack }) : String(error);
  const contextStr = JSON.stringify(context);

  const keysExposed = keyPatterns.some(pattern => 
    pattern.test(errorStr) || pattern.test(contextStr)
  );

  const secretsExposed = secretPatterns.some(pattern => 
    pattern.test(errorStr) || pattern.test(contextStr)
  );

  return {
    containsSensitiveData: sensitiveCheck.containsSensitiveData,
    dataLeaked: sensitiveCheck.containsSensitiveData,
    keysExposed,
    secretsExposed,
    sensitiveFields: sensitiveCheck.sensitiveFields,
  };
}

/**
 * Gera post-mortem padronizado
 */
export async function generatePostMortem(
  error: Error | string,
  context: Record<string, unknown> = {},
  resolution?: {
    resolvedAt?: string;
    actionsTaken?: string[];
    preventiveAction?: string;
  }
): Promise<string> {
  const errorReport = generateErrorReport(error, context);
  const isCritical = isCriticalError(error, context);
  const securityChecks = validateLogForSensitiveData(error, context);

  // Gera ID único do incidente
  const incidentId = createHash('sha256')
    .update(`${errorReport.timestamp}-${errorReport.title}`)
    .digest('hex')
    .substring(0, 16)
    .toUpperCase();

  const detectedAt = errorReport.timestamp;
  const resolvedAt = resolution?.resolvedAt || new Date().toISOString();
  const duration = resolution?.resolvedAt
    ? Math.round((new Date(resolvedAt).getTime() - new Date(detectedAt).getTime()) / 60000)
    : undefined;

  const incident: IncidentReport = {
    id: incidentId,
    severity: isCritical ? 'CRITICAL' : errorReport.severity,
    category: errorReport.category,
    title: errorReport.title,
    description: errorReport.description,
    detectedAt,
    resolvedAt: resolution?.resolvedAt,
    duration,
    rootCause: determineRootCause(error, context),
    impact: {
      description: determineImpact(error, context),
      dataExposed: securityChecks.dataLeaked,
    },
    actionsTaken: resolution?.actionsTaken || [],
    preventiveAction: resolution?.preventiveAction || 'A definir',
    securityChecks: {
      containsSensitiveData: securityChecks.containsSensitiveData,
      sensitiveFields: securityChecks.sensitiveFields,
      dataLeaked: securityChecks.dataLeaked,
      keysExposed: securityChecks.keysExposed,
      secretsExposed: securityChecks.secretsExposed,
    },
    signature: '', // Será calculado depois
    metadata: {
      errorReport,
      txHashes: context.txHash ? [context.txHash as string] : undefined,
      walletAddresses: context.walletAddress ? [context.walletAddress as string] : undefined,
      userIds: context.userId ? [context.userId as string] : undefined,
      network: context.network as string | undefined,
    },
  };

  // Calcula assinatura digital (hash do relatório)
  const reportJson = JSON.stringify(incident, null, 2);
  incident.signature = createHash('sha256')
    .update(reportJson)
    .digest('hex');

  // Gera arquivo post-mortem
  const auditDir = join(process.cwd(), 'audit', 'incidents');
  if (!existsSync(auditDir)) {
    await mkdir(auditDir, { recursive: true });
  }

  const filename = `post-mortem-${incidentId}-${new Date().toISOString().split('T')[0]}.md`;
  const filepath = join(auditDir, filename);

  const content = formatPostMortem(incident);
  await writeFile(filepath, content, 'utf-8');

  // Se é crítico, também cria entrada no log de incidentes críticos
  if (isCritical) {
    await logCriticalIncident(incident);
  }

  return filepath;
}

/**
 * Determina causa raiz
 */
function determineRootCause(error: Error | string, context: Record<string, unknown>): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();

  if (errorLower.includes('network') || errorLower.includes('connection')) {
    return 'Falha de conectividade com XRPL ou serviços externos';
  }

  if (errorLower.includes('permission') || errorLower.includes('unauthorized')) {
    return 'Falha de autorização ou permissões insuficientes';
  }

  if (errorLower.includes('balance') || errorLower.includes('insufficient')) {
    return 'Saldo insuficiente para executar operação';
  }

  if (errorLower.includes('trustline') || errorLower.includes('trust')) {
    return 'Trustline não configurada ou insuficiente';
  }

  if (errorLower.includes('engine_result')) {
    return `Erro do XRPL: ${errorMessage}`;
  }

  if (errorLower.includes('database') || errorLower.includes('prisma')) {
    return 'Falha na comunicação com banco de dados';
  }

  if (errorLower.includes('validation') || errorLower.includes('invalid')) {
    return 'Dados inválidos ou validação falhou';
  }

  return 'Causa raiz a ser investigada - requer análise mais profunda';
}

/**
 * Determina impacto
 */
function determineImpact(error: Error | string, context: Record<string, unknown>): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();

  if (errorLower.includes('transaction') || context.transactionBlocked) {
    return 'Transação bloqueada - usuário não conseguiu completar operação';
  }

  if (errorLower.includes('login') || errorLower.includes('auth')) {
    return 'Usuário não conseguiu fazer login ou autenticar';
  }

  if (errorLower.includes('transfer') || errorLower.includes('payment')) {
    return 'Transferência de tokens falhou - possível perda de confiança do usuário';
  }

  if (errorLower.includes('freeze') || errorLower.includes('lock')) {
    return 'Operação de lock/freeze falhou - pode afetar colateralização';
  }

  return 'Impacto a ser avaliado - requer análise de métricas';
}

/**
 * Formata post-mortem em Markdown
 */
function formatPostMortem(incident: IncidentReport): string {
  const {
    id,
    severity,
    category,
    title,
    description,
    detectedAt,
    resolvedAt,
    duration,
    rootCause,
    impact,
    actionsTaken,
    preventiveAction,
    securityChecks,
    signature,
    metadata,
  } = incident;

  return `# 🛡️ POST-MORTEM - Incidente ${id}

**Severidade:** ${severity}  
**Categoria:** ${category}  
**Data de Detecção:** ${detectedAt}  
${resolvedAt ? `**Data de Resolução:** ${resolvedAt}` : ''}  
${duration ? `**Duração:** ${duration} minutos` : ''}

---

## 📋 Resumo Executivo

**Título:** ${title}

**Descrição:** ${description}

---

## 🔍 Causa Raiz

${rootCause}

---

## 💥 Impacto

**Descrição:** ${impact.description}

${impact.usersAffected ? `- **Usuários Afetados:** ${impact.usersAffected}` : ''}
${impact.transactionsBlocked ? `- **Transações Bloqueadas:** ${impact.transactionsBlocked}` : ''}
${impact.dataExposed !== undefined ? `- **Dados Expostos:** ${impact.dataExposed ? 'SIM ⚠️' : 'NÃO ✅'}` : ''}
${impact.financialImpact ? `- **Impacto Financeiro:** ${impact.financialImpact}` : ''}

---

## ✅ Ações Tomadas

${actionsTaken.length > 0 
  ? actionsTaken.map((action, i) => `${i + 1}. ${action}`).join('\n')
  : 'A definir'
}

---

## 🛡️ Verificações de Segurança

${securityChecks.containsSensitiveData ? `
### ⚠️ DADOS SENSÍVEIS DETECTADOS

- **Dados Expostos:** ${securityChecks.dataLeaked ? 'SIM ⚠️' : 'NÃO ✅'}
- **Chaves Expostas:** ${securityChecks.keysExposed ? 'SIM ⚠️' : 'NÃO ✅'}
- **Secrets Expostos:** ${securityChecks.secretsExposed ? 'SIM ⚠️' : 'NÃO ✅'}
- **Campos Sensíveis:** ${securityChecks.sensitiveFields?.join(', ') || 'Nenhum'}

**AÇÃO IMEDIATA REQUERIDA:** Rotacionar todas as chaves/secrets expostos.
` : `
### ✅ Nenhum Dado Sensível Detectado

- **Dados Expostos:** NÃO ✅
- **Chaves Expostas:** NÃO ✅
- **Secrets Expostos:** NÃO ✅
`}

---

## 🔒 Ação Preventiva

${preventiveAction}

---

## 📊 Metadata

${metadata.txHashes ? `- **Transaction Hashes:** ${metadata.txHashes.join(', ')}` : ''}
${metadata.walletAddresses ? `- **Wallet Addresses:** ${metadata.walletAddresses.join(', ')}` : ''}
${metadata.userIds ? `- **User IDs:** ${metadata.userIds.join(', ')}` : ''}
${metadata.network ? `- **Network:** ${metadata.network}` : ''}

---

## 🔐 Assinatura Digital

**Hash SHA-256:** \`${signature}\`

Este hash garante a integridade deste relatório. Qualquer alteração invalidará a assinatura.

---

## 📝 Relatório de Erro Original

Categoria: ${metadata.errorReport?.category}  
Severidade: ${metadata.errorReport?.severity}  
Timestamp: ${metadata.errorReport?.timestamp}

${metadata.errorReport?.stack ? `
### Stack Trace

\`\`\`
${metadata.errorReport.stack}
\`\`\`
` : ''}

---

**Gerado em:** ${new Date().toISOString()}  
**Sistema:** Terra.FI Security & Compliance Auditor
`;
}

/**
 * Registra incidente crítico no log principal
 */
async function logCriticalIncident(incident: IncidentReport): Promise<void> {
  const auditDir = join(process.cwd(), 'audit', 'incidents');
  if (!existsSync(auditDir)) {
    await mkdir(auditDir, { recursive: true });
  }

  const logFile = join(auditDir, 'CRITICAL_INCIDENTS.log');
  const logEntry = `[${new Date().toISOString()}] ${incident.id} | ${incident.severity} | ${incident.category} | ${incident.title} | Signature: ${incident.signature}\n`;

  const { appendFile } = await import('fs/promises');
  await appendFile(logFile, logEntry, 'utf-8');
}

/**
 * Função helper para auditar incidente crítico
 */
export async function auditCriticalIncident(
  error: Error | string,
  context: Record<string, unknown> = {},
  resolution?: {
    resolvedAt?: string;
    actionsTaken?: string[];
    preventiveAction?: string;
  }
): Promise<string> {
  const isCritical = isCriticalError(error, context);
  
  if (!isCritical) {
    console.warn('[Audit] Erro não é crítico, mas será auditado mesmo assim');
  }

  const filepath = await generatePostMortem(error, context, resolution);
  console.log(`[Audit] Post-mortem gerado: ${filepath}`);
  
  return filepath;
}
