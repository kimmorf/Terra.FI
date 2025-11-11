import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { getPrismaServerClient } from '../lib/prisma-server';
import { validateWebhook, type WebhookSecurityConfig } from '../lib/security/webhook-security';

const prisma = getPrismaServerClient();

// Configuração de segurança para webhooks
const webhookSecurityConfig: WebhookSecurityConfig = {
  secret: process.env.WEBHOOK_SECRET || 'change-me-in-production',
  ttlSeconds: parseInt(process.env.WEBHOOK_TTL_SECONDS || '300', 10),
  rateLimitPerMinute: parseInt(process.env.WEBHOOK_RATE_LIMIT || '60', 10),
};

// Middleware de segurança para webhooks
const webhookSecurity = new Elysia({ name: 'webhook-security' })
  .derive(({ headers, body }) => {
    // Converte body para string se necessário
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    
    // Valida webhook
    const validation = validateWebhook(bodyStr, headers, webhookSecurityConfig);
    
    if (!validation.valid) {
      return {
        webhookValid: false,
        webhookError: validation.error,
        webhookCode: validation.code,
      };
    }
    
    return {
      webhookValid: true,
    };
  })
  .onBeforeHandle(({ webhookValid, webhookError, webhookCode }) => {
    if (!webhookValid) {
      return {
        error: webhookError || 'Webhook inválido',
        code: webhookCode,
      };
    }
  });

const app = new Elysia()
  .use(cors())
  .use(swagger())
  .get('/', () => ({
    message: 'Elysia server is running!',
    timestamp: new Date().toISOString(),
  }))
  .get('/health', () => ({
    status: 'ok',
    uptime: process.uptime(),
  }))
  .group('/api', (app) =>
    app
      .get('/users', () => ({
        users: [],
        message: 'Users endpoint',
      }))
      .post('/users', ({ body }) => ({
        message: 'User created',
        data: body,
      }))
      .get('/issuances', async () => {
        if (!prisma) {
          return { issuances: [], error: 'Database not available' };
        }
        const issuances = await prisma.issuanceRecord.findMany({
          orderBy: { createdAt: 'desc' },
          take: 1000, // Limite para performance
        });
        return { issuances };
      })
      .post(
        '/issuances',
        async ({ body }) => {
          // Webhook de oráculo - aplicar segurança se necessário
          // Por enquanto, apenas loga (pode adicionar validação HMAC depois)
          if (!prisma) {
            return { error: 'Database not available' };
          }

          const record = await prisma.issuanceRecord.create({
            data: {
              projectId: body.projectId,
              projectName: body.projectName,
              tokenType: body.tokenType,
              currency: body.currency,
              amount: body.amount,
              decimals: body.decimals,
              issuer: body.issuer,
              network: body.network,
              txHash: body.txHash,
              metadata: body.metadata ?? {},
              rawResponse: body.rawResponse ?? null,
            },
          });

          return {
            message: 'Issuance registrada com sucesso',
            issuance: {
              ...record,
              createdAt: record.createdAt.toISOString(),
            },
          };
        },
        {
          body: t.Object({
            projectId: t.String(),
            projectName: t.String(),
            tokenType: t.String(),
            currency: t.String(),
            amount: t.String(),
            decimals: t.Number(),
            issuer: t.String(),
            network: t.String(),
            txHash: t.String(),
            metadata: t.Optional(t.Record(t.String(), t.Unknown())),
            rawResponse: t.Optional(t.Unknown()),
          }),
        },
      )
      .get('/actions', async () => {
        if (!prisma) {
          return { actions: [], error: 'Database not available' };
        }
        const actions = await prisma.actionRecord.findMany({
          orderBy: { createdAt: 'desc' },
          take: 1000, // Limite para performance
        });
        return { actions: actions.map(a => ({
          ...a,
          token: { currency: a.tokenCurrency, issuer: a.tokenIssuer },
          createdAt: a.createdAt.toISOString(),
        })) };
      })
      .get('/actions/export', async () => {
        if (!prisma) {
          return new Response(JSON.stringify({ error: 'Database not available' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const actions = await prisma.actionRecord.findMany({
          orderBy: { createdAt: 'desc' },
        });
        const formatted = actions.map(a => ({
          ...a,
          token: { currency: a.tokenCurrency, issuer: a.tokenIssuer },
          createdAt: a.createdAt.toISOString(),
        }));
        return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), actions: formatted }), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="terrafi-actions-${Date.now()}.json"`,
          },
        });
      })
      .post(
        '/actions',
        async ({ body, headers }) => {
          if (!prisma) {
            return { error: 'Database not available' };
          }

          // Extrai informações de auditoria dos headers
          const sourceIP = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown';
          const userAgent = headers['user-agent'] || 'unknown';
          const sourceIPStr = Array.isArray(sourceIP) ? sourceIP[0] : sourceIP;
          const userAgentStr = Array.isArray(userAgent) ? userAgent[0] : userAgent;

          const record = await prisma.actionRecord.create({
            data: {
              type: body.type,
              tokenCurrency: body.token.currency,
              tokenIssuer: body.token.issuer,
              actor: body.actor,
              target: body.target ?? null,
              amount: body.amount ?? null,
              network: body.network,
              txHash: body.txHash,
              metadata: {
                ...body.metadata,
                // Adiciona informações de auditoria
                audit: {
                  sourceIP: sourceIPStr,
                  userAgent: userAgentStr,
                  timestamp: new Date().toISOString(),
                },
              },
            },
          });

          // Se é operação de flag (freeze, clawback, authorize), registra auditoria
          if (['freeze', 'clawback', 'authorize'].includes(body.type)) {
            try {
              const { auditFlagOperation } = await import('../lib/security/flag-audit');
              await auditFlagOperation({
                operation: body.type as 'freeze' | 'clawback' | 'authorize',
                tokenCurrency: body.token.currency,
                tokenIssuer: body.token.issuer,
                executor: body.actor,
                target: body.target,
                amount: body.amount,
                network: body.network as 'testnet' | 'mainnet' | 'devnet',
                txHash: body.txHash,
                sourceIP: sourceIPStr,
                userAgent: userAgentStr,
                metadata: body.metadata,
              });
            } catch (error) {
              console.error('[Server] Erro ao registrar auditoria de flag:', error);
              // Não falha a requisição se auditoria falhar
            }
          }

          return {
            message: 'Ação registrada com sucesso',
            action: {
              ...record,
              token: { currency: record.tokenCurrency, issuer: record.tokenIssuer },
              createdAt: record.createdAt.toISOString(),
            },
          };
        },
        {
          body: t.Object({
            type: t.Union([
              t.Literal('authorize'),
              t.Literal('payment'),
              t.Literal('freeze'),
              t.Literal('clawback'),
              t.Literal('payout'),
              t.Literal('error'),
              t.Literal('trustset'),
            ]),
            token: t.Object({
              currency: t.String(),
              issuer: t.String(),
            }),
            actor: t.String(),
            target: t.Optional(t.String()),
            amount: t.Optional(t.String()),
            network: t.String(),
            txHash: t.String(),
            metadata: t.Optional(t.Record(t.String(), t.Unknown())),
          }),
        },
      )
      // Endpoint para consultar auditoria de flags
      .get('/flags/audit', async ({ query }) => {
        if (!prisma) {
          return { audits: [], error: 'Database not available' };
        }

        const { getFlagAuditHistory } = await import('../lib/security/flag-audit');
        const issuer = query.issuer as string | undefined;
        const operation = query.operation as 'freeze' | 'clawback' | 'authorize' | undefined;
        const limit = parseInt((query.limit as string) || '100', 10);

        const audits = await getFlagAuditHistory(issuer, operation, limit);
        return { audits };
      })
      // Endpoint para configurar permissões de issuer
      .post('/flags/permissions', async ({ body }) => {
        if (!prisma) {
          return { error: 'Database not available' };
        }

        const { setIssuerPermissions } = await import('../lib/security/flag-audit');
        const result = await setIssuerPermissions(
          body.issuer,
          body.network,
          {
            canFreeze: body.canFreeze,
            canClawback: body.canClawback,
            canAuthorize: body.canAuthorize,
            authorizedWallets: body.authorizedWallets,
            regularKey: body.regularKey,
            coldWallet: body.coldWallet,
            requireColdWalletForFreeze: body.requireColdWalletForFreeze,
            requireColdWalletForClawback: body.requireColdWalletForClawback,
          }
        );

        return { message: 'Permissões configuradas com sucesso', permission: result };
      }, {
        body: t.Object({
          issuer: t.String(),
          network: t.String(),
          canFreeze: t.Optional(t.Boolean()),
          canClawback: t.Optional(t.Boolean()),
          canAuthorize: t.Optional(t.Boolean()),
          authorizedWallets: t.Optional(t.Array(t.String())),
          regularKey: t.Optional(t.String()),
          coldWallet: t.Optional(t.String()),
          requireColdWalletForFreeze: t.Optional(t.Boolean()),
          requireColdWalletForClawback: t.Optional(t.Boolean()),
        }),
      }),
  )
  .listen(process.env.ELYSIA_PORT || 3001);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);

