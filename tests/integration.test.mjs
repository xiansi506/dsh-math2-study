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

  const routes = new Map();
  applyHost({ effect(register) { register(); }, connection: { fetch: {
    register(value) { routes.set(value.path, value); return async () => {}; },
  } } });
  const route = routes.get(dashboardPath);
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
  const { attemptId } = await write({ action: 'record_attempt', operationId: 'record-1', data: {
    questionId, sourceKey: 'test-session/message/1', answer: '我的作答是 0', result: 'wrong', hints: 0,
    diagnostic: '直接代入时把未定式当成了结果', confirmedCause: '直接代入未定式',
  } }, execution);
  const snapshot = await (await route.fetch()).json();
  assert.equal(snapshot.counts.attempts, 1);
  assert.equal(snapshot.counts.errors, 1);
  assert.equal(snapshot.recent[0].questionId, questionId);
  assert.doesNotMatch(JSON.stringify(snapshot), /我的作答是 0|仅用于核验的测试答案/);

  const variant = await write({ action: 'save_question', operationId: 'variant-1', data: {
    ...question, title: '极限变式', statement: '计算 x→0 时 tan x/x', internalSolution: '仅供批改的变式答案',
  } }, execution);
  const { reviewId } = await write({ action: 'schedule_review', operationId: 'review-1', data: {
    questionId, assignedQuestionId: variant.questionId, due: snapshot.today, minutes: 8,
  } }, execution);

  const detail = routes.get('/api/dsh-math2-study/detail');
  assert.deepEqual(detail?.methods, ['GET']);
  const request = query => new Request(`http://localhost${detail.path}?${query}`);
  assert.equal((await detail.fetch(request('id=...'))).status, 400);
  assert.equal((await detail.fetch(request(`id=${reviewId}&id=${attemptId}`))).status, 400);
  assert.equal((await detail.fetch(request('id=A-9999'))).status, 404);

  const taskResponse = await detail.fetch(request(`id=${reviewId}`));
  assert.equal(taskResponse.status, 200);
  assert.equal(taskResponse.headers.get('cache-control'), 'no-store');
  const task = await taskResponse.json();
  assert.equal(task.kind, 'review');
  assert.equal(task.sourceQuestionId, questionId);
  assert.equal(task.questionId, variant.questionId);
  assert.equal(task.reviewKind, 'variant');
  assert.equal(task.statement, '计算 x→0 时 tan x/x');
  assert.doesNotMatch(JSON.stringify(task), /仅供批改的变式答案|仅用于核验的测试答案|我的作答是 0/);

  const attemptResponse = await detail.fetch(request(`id=${attemptId}`));
  assert.equal(attemptResponse.status, 200);
  const attempt = await attemptResponse.json();
  assert.equal(attempt.kind, 'attempt');
  assert.equal(attempt.statement, '计算 x→0 时 sin x/x');
  assert.equal(attempt.answer, '我的作答是 0');
  assert.equal(attempt.diagnostic, '直接代入时把未定式当成了结果');
  assert.equal(attempt.confirmedCause, '直接代入未定式');
  assert.doesNotMatch(JSON.stringify(attempt), /仅用于核验的测试答案|test-session|TX-/);

  const variantAttempt = await write({ action: 'record_attempt', operationId: 'record-variant', data: {
    questionId: variant.questionId, sourceKey: 'test-session/message/2', answer: '利用等价无穷小得到 1',
    result: 'independent_correct', hints: 0,
  } }, execution);
  await write({ action: 'complete_review', operationId: 'complete-variant', data: {
    reviewId, attemptId: variantAttempt.attemptId,
  } }, execution);
  assert.equal((await (await route.fetch()).json()).counts.due, 0);
  assert.equal((await (await detail.fetch(request(`id=${reviewId}`))).json()).status, 'completed');

  await write({ action: 'correct_attempt', operationId: 'correct-variant', data: {
    attemptId: variantAttempt.attemptId, result: 'unfinished', reason: '用户确认记录中包含未完成的推导',
  } }, execution);
  const corrected = await (await route.fetch()).json();
  assert.equal(corrected.counts.due, 1);
  assert.equal(corrected.counts.independent, 0);
  assert.equal((await (await detail.fetch(request(`id=${reviewId}`))).json()).status, 'pending');
});
