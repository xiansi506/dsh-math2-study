import { homedir } from 'node:os';
import { join } from 'node:path';
import { createStudyStore } from './study.mjs';

export const name = 'math2-study-dashboard';
export const inject = ['connection'];

export const databasePath = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'math2-study', 'study.sqlite');
export const dashboardPath = '/api/dsh-math2-study/dashboard';
export const dashboardDetailPath = '/api/dsh-math2-study/detail';

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

  ctx.effect(() => ctx.connection.fetch.register({
    path: dashboardDetailPath,
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const ids = new URL(request.url).searchParams.getAll('id');
      if (ids.length !== 1 || !/^[AR]-\d{4,18}$/.test(ids[0])) {
        return Response.json({ error: 'invalid_id' }, { status: 400, headers });
      }
      try {
        const detail = store.readDashboardDetail(ids[0]);
        return detail === null
          ? Response.json({ error: 'not_found' }, { status: 404, headers })
          : Response.json(detail, { headers });
      } catch {
        return Response.json({ error: 'storage_unavailable' }, { status: 503, headers });
      }
    },
  }), 'math2-study: dashboard detail route');
}
