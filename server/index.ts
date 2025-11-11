import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';

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
  )
  .listen(process.env.ELYSIA_PORT || 3001);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);

