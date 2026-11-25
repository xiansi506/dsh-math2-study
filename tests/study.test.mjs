import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
