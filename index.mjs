import { homedir } from 'node:os';
import { join } from 'node:path';
import { createStudyStore } from './study.mjs';

export const name = 'math2-study-dashboard';
export const inject = ['connection'];

export const databasePath = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'math2-study', 'study.sqlite');
export const dashboardPath = '/api/dsh-math2-study/dashboard';

export function apply(ctx) {
  const store = createStudyStore(databasePath());
  const headers = { 'Cache-Control': 'no-store' };
  ctx.effect(() => ctx.connection.fetch.register({
    path: dashboardPath,
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      try {
        return Response.json(store.dashboard(), { headers });
      } catch {
        return Response.json({ error: 'storage_unavailable' }, { status: 503, headers });
      }
    },
  }), 'math2-study: dashboard route');
}
