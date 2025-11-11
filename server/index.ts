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

const issuances: IssuanceRecord[] = [];

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
  )
  .listen(process.env.ELYSIA_PORT || 3001);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);

