import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';

interface IssuanceRecord {
  id: string;
  projectId: string;
  projectName: string;
  tokenType: string;
  currency: string;
  amount: string;
  decimals: number;
  issuer: string;
  network: string;
  txHash: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  rawResponse?: unknown;
}

interface ActionRecord {
  id: string;
  type: 'authorize' | 'payment' | 'freeze' | 'clawback';
  token: {
    currency: string;
    issuer: string;
  };
  actor: string;
  target?: string;
  amount?: string;
  network: string;
  txHash: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const issuances: IssuanceRecord[] = [];
const actions: ActionRecord[] = [];

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
      .get('/issuances', () => ({
        issuances,
      }))
      .post(
        '/issuances',
        ({ body }) => {
          const record: IssuanceRecord = {
            id: crypto.randomUUID(),
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
            createdAt: new Date().toISOString(),
            rawResponse: body.rawResponse,
          };

          issuances.push(record);

          return {
            message: 'Issuance registrada com sucesso',
            issuance: record,
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
      ),
      .get('/actions', () => ({
        actions,
      }))
  .post(
    '/actions',
    ({ body }) => {
      const record: ActionRecord = {
        id: crypto.randomUUID(),
        type: body.type,
        token: {
          currency: body.token.currency,
          issuer: body.token.issuer,
        },
        actor: body.actor,
        target: body.target,
        amount: body.amount,
        network: body.network,
        txHash: body.txHash,
        metadata: body.metadata ?? {},
        createdAt: new Date().toISOString(),
      };

      actions.push(record);

      return {
        message: 'Ação registrada com sucesso',
        action: record,
      };
    },
    {
      body: t.Object({
        type: t.Union([
          t.Literal('authorize'),
          t.Literal('payment'),
          t.Literal('freeze'),
          t.Literal('clawback'),
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
  ),
  )
  .listen(process.env.ELYSIA_PORT || 3001);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);

