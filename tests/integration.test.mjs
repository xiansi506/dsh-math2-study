import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { apply as applyHost, dashboardPath } from '../index.mjs';
import { apply as applyTools } from '../tools.mjs';

test('预设工具写入后，面板接口从同一学习库读到作答', async t => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-math2-host-'));
  const old = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  t.after(() => {
    if (old === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = old;
    const data = join(home, 'math2-study');
    rmSync(join(data, 'study.sqlite'), { force: true });
    if (existsSync(data)) rmdirSync(data);
    rmdirSync(home);
  });

  let route;
  applyHost({ effect(register) { register(); }, connection: { fetch: {
    register(value) { route = value; return async () => {}; },
  } } });
  const tools = new Map();
  applyTools({ tools: { register(tool) { tools.set(tool.name, tool); } } });
  assert.equal(route.path, dashboardPath);
  assert.deepEqual(route.methods, ['GET']);
  assert.equal((await (await route.fetch()).json()).initialized, false);

  const read = tools.get('math2_read').execute;
  const write = tools.get('math2_write').execute;
  for (const skill of ['core', ...Array.from({ length: 12 }, (_, n) => String(n + 1).padStart(2, '0'))]) {
    assert.match((await read({ skill })).guidance, /DSH 适配约定/);
  }
  assert.ok((await read({ operations: true })).operations.record_attempt);
  const execution = { callId: 'call-test', signal: new AbortController().signal };
  const question = { chapter: 'GS01', title: '极限练习', statement: '计算 x→0 时 sin x/x', pending: true, internalSolution: '仅用于核验的测试答案' };
  const { pending: _pending, internalSolution: _solution, ...collectible } = question;
  const { questionId } = await write({ action: 'save_question', data: collectible }, execution);
  const pendingReceipt = await write({ action: 'save_question', operationId: 'pending-1', data: question }, execution);
  assert.equal(pendingReceipt.questionId, questionId);
  assert.equal(pendingReceipt.status, 'pending');
  const pending = await read({ id: questionId });
  assert.equal(pending.solution, undefined);

  const response = await route.fetch();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /仅用于核验的测试答案/);
  await write({ action: 'record_attempt', operationId: 'record-1', data: {
    questionId, sourceKey: 'test-session/message/1', answer: '我的作答是 0', result: 'wrong', hints: 0,
  } }, execution);
  const snapshot = await (await route.fetch()).json();
  assert.equal(snapshot.counts.attempts, 1);
  assert.equal(snapshot.counts.errors, 1);
  assert.equal(snapshot.recent[0].questionId, questionId);
  assert.doesNotMatch(JSON.stringify(snapshot), /我的作答是 0|仅用于核验的测试答案/);
});
