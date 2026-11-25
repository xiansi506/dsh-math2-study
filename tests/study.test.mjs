import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createStudyStore } from '../study.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-math2-'));
  const file = join(dir, 'study.sqlite');
  t.after(() => {
    rmSync(file, { force: true });
    rmdirSync(dir);
  });
  return { file, store: createStudyStore(file) };
}

const now = new Date('2026-11-25T04:00:00Z');
const question = { chapter: 'GS01', statement: '求 x→0 时 sin(x)/x 的极限', source: '教材 第一章 例1', sourceType: 'textbook' };

test('空库读取保持只读，收藏题不产生作答或错题', t => {
  const { file, store } = fixture(t);
  assert.equal(store.dashboard(now).initialized, false);
  assert.equal(existsSync(file), false);
  const saved = store.change('question-1', 'save_question', question, now);
  assert.equal(store.dashboard(now).counts.attempts, 0);
  assert.equal(store.dashboard(now).counts.errors, 0);
  assert.equal(store.read({ id: saved.questionId }).question.status, 'unattempted');
});

test('恢复后同一作答仍保留原 ID，新作答共享题目 ID', t => {
  const { file, store } = fixture(t);
  const first = { question, sourceKey: 'chat/123/1', answer: '1', result: 'independent_correct', hints: 0 };
  const one = store.change('call-1', 'record_attempt', first, now);
  const reopened = createStudyStore(file);
  const replay = reopened.change('call-2', 'record_attempt', first, now);
  assert.equal(replay.attemptId, one.attemptId);
  assert.equal(replay.transactionId, one.transactionId);
  const two = reopened.change('call-3', 'record_attempt', {
    questionId: one.questionId, sourceKey: 'chat/124/1', answer: '0', result: 'wrong', hints: 0,
  }, now);
  assert.notEqual(two.attemptId, one.attemptId);
  assert.equal(two.questionId, one.questionId);
  assert.match(two.errorId, /^M2-GS-/);
  assert.equal(reopened.dashboard(now).counts.attempts, 2);
  assert.equal(reopened.dashboard(now).counts.errors, 1);
  assert.deepEqual(reopened.change('call-3', 'record_attempt', {
    questionId: one.questionId, sourceKey: 'chat/124/1', answer: '0', result: 'wrong', hints: 0,
  }, now), two);
});

test('失败事务回滚，猜对与提示后正确不具备独立掌握证据', t => {
  const { store } = fixture(t);
  const one = store.change('call-1', 'record_attempt', {
    question, sourceKey: 'chat/123/1', answer: '1', result: 'hinted_correct', hints: 1,
  }, now);
  const revision = store.dashboard(now).revision;
  assert.throws(() => store.change('bad', 'record_attempt', {
    question: { ...question, statement: '另一道题' }, sourceKey: 'chat/123/1', answer: '2', result: 'wrong', hints: 0,
  }, now), /来源键/);
  assert.throws(() => store.change('bad-2', 'set_mastery', { chapter: 'GS01', level: 3, evidence: [one.attemptId], note: '待独立练习' }, now));
  const snapshot = store.dashboard(now);
  assert.equal(snapshot.revision, revision);
  assert.equal(snapshot.counts.questions, 1);
  assert.equal(snapshot.counts.attempts, 1);
});

test('课程覆盖独立于掌握度，复习按本地日期显示', t => {
  const { store } = fixture(t);
  const { questionId } = store.change('q', 'save_question', question, now);
  store.change('p', 'set_coverage', { chapter: 'GS01', coverage: 'learned', evidence: '用户确认已学完这一章' }, now);
  store.change('r', 'schedule_review', { questionId, due: '2026-11-25', minutes: 12, priority: 'P1' }, now);
  const snapshot = store.dashboard(now);
  assert.equal(snapshot.chapters.find(chapter => chapter.id === 'GS01').coverage, 'learned');
  assert.equal(snapshot.chapters.find(chapter => chapter.id === 'GS01').mastery, null);
  assert.equal(snapshot.counts.due, 1);
  assert.equal(snapshot.dueReviews[0].minutes, 12);
  assert.equal(snapshot.series.length, 14);
});

test('单个知识点评估带范围，作答更正后等待复核', t => {
  const { store } = fixture(t);
  const { attemptId } = store.change('a', 'record_attempt', {
    question, sourceKey: 'chat/125/1', answer: '1', result: 'independent_correct', hints: 0,
  }, now);
  store.change('m', 'set_mastery', { chapter: 'GS01', target: '两个重要极限', level: 3, evidence: [attemptId], note: '独立应用正确' }, now);
  const before = store.dashboard(now).chapters[0];
  assert.equal(before.coverage, 'unknown');
  assert.equal(before.masteryTarget, '两个重要极限');
  store.change('c', 'correct_attempt', { attemptId, result: 'guessed', reason: '用户确认是猜测' }, now);
  assert.equal(store.dashboard(now).chapters[0].mastery, null);
  assert.equal(store.dashboard(now).chapters[0].needsReview, true);
  const { assessments } = store.read({ chapter: 'GS01' }).chapter;
  assert.equal(assessments[0].level, null);
  assert.equal(assessments[0].needsReview, true);
});

test('每次重做累积本次提示，提交后清空本次提示', t => {
  const { store } = fixture(t);
  const { questionId } = store.change('a', 'record_attempt', {
    question, sourceKey: 'chat/1/1', answer: '1', result: 'independent_correct', hints: 0,
  }, now);
  store.change('hint', 'save_hint', { questionId, level: 2 }, now);
  assert.throws(() => store.change('b', 'record_attempt', {
    questionId, sourceKey: 'chat/2/1', answer: '1', result: 'independent_correct', hints: 0,
  }, now), /提示/);
  const { attemptId } = store.change('b', 'record_attempt', {
    questionId, sourceKey: 'chat/2/1', answer: '1', result: 'hinted_correct',
  }, now);
  assert.equal(store.read({ id: attemptId }).attempt.hints, 2);
  store.change('c', 'record_attempt', {
    questionId, sourceKey: 'chat/3/1', answer: '1', result: 'independent_correct', hints: 0,
  }, now);
  assert.equal(store.dashboard(now).counts.independent, 2);
});

test('待复习任务只由排期后完成的同题作答关闭，支持检索', t => {
  const { store } = fixture(t);
  const old = store.change('old', 'record_attempt', {
    question, sourceKey: 'chat/old/1', answer: '1', result: 'independent_correct', hints: 0,
  }, now);
  const { questionId } = old;
  const { reviewId } = store.change('schedule', 'schedule_review', { questionId, due: '2026-11-25', minutes: 12 }, now);
  assert.throws(() => store.change('old-review', 'complete_review', { reviewId, attemptId: old.attemptId }, now));
  const unfinished = store.change('unfinished', 'record_attempt', {
    questionId, sourceKey: 'chat/new/1', answer: '我做到有界这一步', result: 'unfinished',
  }, now);
  assert.throws(() => store.change('incomplete-review', 'complete_review', { reviewId, attemptId: unfinished.attemptId }, now));
  assert.equal(store.read({ sourceKey: 'chat/new/1' }).attempt.id, unfinished.attemptId);
  assert.equal(store.read({ search: 'sin(x)' }).questions[0].id, questionId);
  assert.equal(store.read({ reviewStatus: 'due', today: '2026-11-25' }).reviews[0].id, reviewId);
  const finished = store.change('finished', 'record_attempt', {
    questionId, sourceKey: 'chat/new/2', answer: '1', result: 'independent_correct', hints: 0,
  }, now);
  store.change('completed', 'complete_review', { reviewId, attemptId: finished.attemptId }, now);
  assert.equal(store.dashboard(now).counts.due, 0);
});

test('稳定掌握需要两种题面以外的间隔验证', t => {
  const { store } = fixture(t);
  const add = (number, at) => store.change(`call-${number}`, 'record_attempt', {
    question: { ...question, statement: `同考点变式 ${number}` }, sourceKey: `source-${number}`, answer: '核验过的独立过程',
    result: 'independent_correct', hints: 0,
  }, new Date(at)).attemptId;
  const first = add(1, '2026-11-01T04:00:00Z');
  const second = add(2, '2026-11-08T04:00:00Z');
  const assessment = { chapter: 'GS01', target: '两个重要极限', level: 5, note: '能说明方法条件与等价替换陷阱' };
  assert.throws(() => store.change('assessment-1', 'set_mastery', { ...assessment, evidence: [first, second] }, now), /间隔验证/);
  const third = add(3, '2026-11-16T04:00:00Z');
  assert.equal(store.change('assessment-2', 'set_mastery', { ...assessment, evidence: [first, second, third] }, now).level, 5);
});

test('同来源题面的格式差异共享编号，数学条件仍需一致', t => {
  const { store } = fixture(t);
  const first = store.change('first', 'save_question', question, now);
  const formatted = { ...question, statement: '求 x → 0 时 sin(x) / x 的极限', sourceNumber: '例1' };
  const same = store.change('format', 'save_question', formatted, now);
  assert.equal(same.questionId, first.questionId);
  assert.equal(store.read({ id: first.questionId }).question.sourceNumber, '例1');
  const changed = store.change('changed', 'save_question', { ...formatted, statement: formatted.statement.replace('→ 0', '→ 1') }, now);
  assert.notEqual(changed.questionId, first.questionId);
  const separator = store.change('separator', 'save_question', { ...question, statement: '计算 ax' }, now);
  assert.notEqual(store.change('separated', 'save_question', { ...question, statement: '计算 a x' }, now).questionId, separator.questionId);
  const attempt = { question, sourceKey: 'source/1', answer: '1', result: 'independent_correct', hints: 0 };
  const original = store.change('attempt', 'record_attempt', attempt, now);
  const replay = store.change('retry', 'record_attempt', { ...attempt, question: formatted }, now);
  assert.deepEqual(replay, original);
});

test('变式复习按实际题核验，旧作答和无关题保持独立', t => {
  const { store } = fixture(t);
  const source = store.change('q', 'save_question', question, now);
  const variant = store.change('variant', 'save_question', {
    ...question, statement: '求 x→0 时 (1−cos x)/x² 的极限', sourceType: 'generated',
  }, now);
  const task = store.change('schedule', 'schedule_review', {
    questionId: source.questionId, assignedQuestionId: variant.questionId, due: '2026-11-25', minutes: 8,
  }, now);
  const view = store.dashboard(now).dueReviews[0];
  assert.equal(view.questionId, variant.questionId);
  assert.equal(view.sourceQuestionId, source.questionId);
  assert.equal(view.reviewKind, 'variant');
  const attempt = (key, questionId, occurredAt) => store.change(key, 'record_attempt', {
    questionId, sourceKey: key, answer: '实际作答', result: 'independent_correct', hints: 0, occurredAt,
  }, now);
  for (const [key, attempted] of [
    ['source', attempt('source-attempt', source.questionId)],
    ['old', attempt('backfilled-old', variant.questionId, '2026-11-24')],
    ['earlier', attempt('backfilled-earlier', variant.questionId, '2026-11-25T11:59:00+08:00')],
    ['unknown', attempt('unknown-time', variant.questionId, null)],
  ]) {
    assert.throws(() => store.change(key, 'complete_review', { reviewId: task.reviewId, attemptId: attempted.attemptId }, now), /排期后/);
  }
  const latest = attempt('variant-attempt', variant.questionId);
  store.change('complete', 'complete_review', { reviewId: task.reviewId, attemptId: latest.attemptId }, now);
  assert.equal(store.dashboard(now).counts.due, 0);
});

test('作答修订会撤回复习完成状态并保留证据历史', t => {
  const { store } = fixture(t);
  const { questionId } = store.change('q', 'save_question', question, now);
  const schedule = key => store.change(key, 'schedule_review', { questionId, due: '2026-11-25', minutes: 8 }, now).reviewId;
  const record = key => store.change(key, 'record_attempt', {
    questionId, sourceKey: key, answer: '1', result: 'independent_correct', hints: 0,
  }, now).attemptId;
  const complete = (key, reviewId, attemptId) => store.change(key, 'complete_review', { reviewId, attemptId }, now);
  const first = schedule('first');
  const initial = record('initial');
  complete('done', first, initial);
  const second = schedule('second');
  store.change('undo', 'correct_attempt', { attemptId: initial, result: 'unfinished', reason: '仅写了提示' }, now);
  const { review } = store.read({ id: first });
  assert.equal(review.status, 'needs_review');
  assert.equal(review.attemptId, undefined);
  assert.equal(review.completionHistory[0].attemptId, initial);
  assert.equal(store.read({ id: second }).review.status, 'pending');
  assert.equal(store.read({ reviewStatus: 'needs_review' }).reviews[0].id, first);
  assert.equal(store.dashboard(now).counts.due, 2);
  const replacement = record('replacement');
  complete('recheck', first, replacement);
  assert.throws(() => complete('duplicate-evidence', second, replacement), /未用于其他任务/);
  store.change('incorrectly-completed', 'correct_attempt', { attemptId: replacement, result: 'unverified', reason: '暂未核对结果' }, now);
  assert.throws(() => {
    store.change('verify-old', 'correct_attempt', { attemptId: replacement, result: 'independent_correct', reason: '重新核实' }, now);
    complete('reuse-history', second, replacement);
  }, /未用于其他任务/);
  const end = record('last-attempt');
  complete('done-second', second, end);
  store.change('undo-second', 'correct_attempt', { attemptId: end, result: 'unverified', reason: '未见完整作答' }, now);
  assert.equal(store.read({ id: second }).review.status, 'pending');
  assert.equal(store.dashboard(now).counts.due, 2);
});

test('作答趋势与排序使用发生时间，保留入库时间和未知日期', t => {
  const { store } = fixture(t);
  const add = (key, occurredAt) => store.change(key, 'record_attempt', {
    question, sourceKey: key, answer: '1', result: 'independent_correct', hints: 0, occurredAt,
  }, now);
  const recent = add('recent', '2026-11-24T23:00:00+08:00');
  const previous = add('previous', '2026-11-20');
  const unknown = add('unknown', null);
  const { series, counts } = store.dashboard(now);
  assert.equal(counts.attempts, 3);
  assert.deepEqual(series.filter(day => day.attempts > 0).map(day => day.day), ['2026-11-20', '2026-11-24']);
  assert.deepEqual(store.dashboard(now).recent.map(item => item.id), [recent.attemptId, previous.attemptId, unknown.attemptId]);
  const detail = store.readDashboardDetail(previous.attemptId);
  assert.equal(detail.occurredAt, '2026-11-20');
  assert.equal(detail.recordedAt, now.toISOString());
  assert.equal(store.readDashboardDetail(recent.attemptId).occurredAt, '2026-11-24T15:00:00.000Z');
  assert.equal(store.readDashboardDetail(unknown.attemptId).occurredAt, null);
  for (const date of ['2026-02-30', '2026-02-30T01:00:00Z', '2026-11-24T24:00:00Z', '2026-11-24T10:00:00']) {
    assert.throws(() => add('bad-' + date, date), /作答时间/);
  }
  assert.equal(store.dashboard(now).counts.attempts, 3);
});

test('旧编号、旧时间、复习与历史重放继续可用，净化的详情不泄露答案', t => {
  const { file, store } = fixture(t);
  const q = { ...question, pending: true, internalSolution: '隐藏答案' };
  const created = store.change('q', 'save_question', q, now);
  const task = store.change('task', 'schedule_review', { questionId: created.questionId, due: '2026-11-25', minutes: 7 }, now);
  const input = { questionId: created.questionId, sourceKey: 'private-source', answer: '我的作答', result: 'independent_correct', hints: 0 };
  const attempt = store.change('old', 'record_attempt', input, now);
  const db = new DatabaseSync(file);
  try {
    const data = JSON.parse(db.prepare('SELECT payload FROM study').get().payload);
    const old = data.attempts[0];
    old.at = now.toISOString();
    delete old.occurredAt;
    delete old.recordedAt;
    delete data.reviews[0].assignedQuestionId;
    data.questions.push({ ...data.questions[0], id: 'Q-0002', statement: '求 x → 0 时 sin(x) / x 的极限' });
    db.prepare('UPDATE study SET payload = ?').run(JSON.stringify(data));
  } finally { db.close(); }
  const reopened = createStudyStore(file);
  assert.deepEqual(reopened.change('old', 'record_attempt', input, now), attempt);
  assert.equal(reopened.read({ id: 'Q-0002' }).question.id, 'Q-0002');
  assert.throws(() => reopened.change('ambiguous', 'save_question', question, now), /Q-ID/);
  const review = reopened.readDashboardDetail(task.reviewId);
  assert.equal(review.questionId, created.questionId);
  assert.equal(review.reviewKind, 'original');
  assert.equal(review.statement, question.statement);
  const detail = reopened.readDashboardDetail(attempt.attemptId);
  assert.equal(detail.occurredAt, now.toISOString());
  assert.equal(detail.recordedAt, now.toISOString());
  assert.equal(detail.answer, input.answer);
  for (const payload of [review, detail]) {
    assert.doesNotMatch(JSON.stringify(payload), /隐藏答案|private-source|receipt/);
  }
  assert.equal(reopened.readDashboardDetail('R-9999'), null);
  assert.equal(reopened.readDashboardDetail('A-9999'), null);
});

test('复习换题后使用新的排期，更正作答日期会撤回失效的完成状态', t => {
  const { store } = fixture(t);
  const source = store.change('source', 'save_question', question, now).questionId;
  const variant = store.change('variant', 'save_question', { ...question, statement: '求 sin(2x)/x 的极限' }, now).questionId;
  const schedule = (key, details) => store.change(key, 'schedule_review', {
    questionId: source, due: '2026-11-25', minutes: 7, ...details,
  }, now).reviewId;
  const add = key => store.change(key, 'record_attempt', {
    questionId: variant, sourceKey: key, answer: '2', result: 'independent_correct', hints: 0,
  }, now).attemptId;
  const reviewId = schedule('initial', {});
  const beforeSwap = add('before');
  schedule('swap', { reviewId, assignedQuestionId: variant });
  schedule('defer', { reviewId, due: '2026-11-26' });
  assert.equal(store.readDashboardDetail(reviewId).questionId, variant);
  assert.throws(() => store.change('too-early', 'complete_review', { reviewId, attemptId: beforeSwap }, now), /排期后/);
  const attemptId = add('valid');
  store.change('finish', 'complete_review', { reviewId, attemptId }, now);
  const correction = store.change('time-correction', 'correct_attempt', {
    attemptId, occurredAt: '2026-11-24', reason: '按原草稿重新核对日期',
  }, now);
  assert.deepEqual(correction.reopenedReviewIds, [reviewId]);
  assert.equal(store.readDashboardDetail(reviewId).status, 'pending');
  const { attempt } = store.read({ id: attemptId });
  assert.equal(attempt.occurredAt, '2026-11-24');
  assert.equal(attempt.recordedAt, now.toISOString());
  assert.equal(attempt.corrections[0].occurredAt, now.toISOString());
});

test('补录的作答日期可证明间隔，日期更正后稳定掌握需复核', t => {
  const { store } = fixture(t);
  const evidence = ['2026-11-01', '2026-11-08', '2026-11-16'].map((occurredAt, i) => store.change(occurredAt, 'record_attempt', {
    question: { ...question, statement: `练习 ${i + 1}` }, sourceKey: occurredAt, occurredAt,
    answer: '核验过的独立过程', result: 'independent_correct', hints: 0,
  }, now).attemptId);
  store.change('mastery', 'set_mastery', { chapter: 'GS01', target: '极限', level: 5, evidence, note: '跨时验证' }, now);
  assert.equal(store.dashboard(now).chapters[0].mastery, 5);
  store.change('fix-time', 'correct_attempt', { attemptId: evidence[2], occurredAt: null, reason: '实际日期缺少记录' }, now);
  assert.equal(store.dashboard(now).chapters[0].needsReview, true);
  assert.equal(store.dashboard(now).chapters[0].mastery, null);
});

test('同日补录需确认具体时刻才能证明在排期后完成', t => {
  const { store } = fixture(t);
  const questionId = store.change('q', 'save_question', question, now).questionId;
  const { reviewId } = store.change('schedule', 'schedule_review', {
    questionId, due: '2026-11-25', minutes: 8,
  }, now);
  const recordedAt = new Date('2026-11-25T08:00:00Z');
  const { attemptId } = store.change('record', 'record_attempt', {
    questionId, sourceKey: 'review/today', answer: '1', result: 'independent_correct', hints: 0,
    occurredAt: '2026-11-25',
  }, recordedAt);
  assert.throws(() => store.change('complete', 'complete_review', { reviewId, attemptId }, recordedAt), /排期后/);
  assert.equal(store.read({ id: reviewId }).review.status, 'pending');
  store.change('confirm-time', 'correct_attempt', {
    attemptId, occurredAt: '2026-11-25T07:30:00Z', reason: '核对草稿时间',
  }, recordedAt);
  assert.equal(store.change('complete', 'complete_review', { reviewId, attemptId }, recordedAt).reviewId, reviewId);
});

test('更正日期仍以原入库时间为上界', t => {
  const { store } = fixture(t);
  const { attemptId } = store.change('record', 'record_attempt', {
    question, sourceKey: 'date/correction', answer: '1', result: 'independent_correct', hints: 0,
  }, now);
  const later = new Date('2026-11-28T08:00:00Z');
  assert.throws(() => store.change('correction', 'correct_attempt', {
    attemptId, occurredAt: '2026-11-26', reason: '更正日期',
  }, later), /晚于入库时间/);
  const { attempt } = store.read({ id: attemptId });
  assert.equal(attempt.occurredAt, now.toISOString());
  assert.equal(attempt.recordedAt, now.toISOString());
  assert.deepEqual(attempt.corrections, []);
});
