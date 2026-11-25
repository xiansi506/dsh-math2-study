import { mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const chapters = [
  ['GS01', '函数、极限与连续'], ['GS02', '一元函数微分学'], ['GS03', '一元函数积分学'],
  ['GS04', '多元函数微分学'], ['GS05', '二重积分'], ['GS06', '常微分方程'],
  ['LA01', '行列式'], ['LA02', '矩阵'], ['LA03', '向量'], ['LA04', '线性方程组'],
  ['LA05', '特征值与特征向量'], ['LA06', '二次型'],
];

const results = ['wrong', 'unfinished', 'guessed', 'hinted_correct', 'independent_correct', 'unverified'];
const wrongResults = new Set(['wrong', 'guessed']);
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const defaultTimeZone = 'Asia/Shanghai';

function emptyStudy() {
  return { revision: 0, updatedAt: null, profile: {}, questions: [], attempts: [], errors: [], reviews: [], assessments: {}, coverage: {}, notes: [] };
}

function record(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}须为对象`);
  return value;
}

function string(value, name, limit = 8000) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`${name}为空或超出长度限制`);
  return value.trim();
}

function optionalText(value, name, limit) {
  return value === undefined ? null : string(value, name, limit);
}

function choice(value, options, name) {
  if (!options.includes(value)) throw new Error(`${name}须为 ${options.join(' / ')}`);
  return value;
}

function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name}须在 ${min}–${max} 之间`);
  return value;
}

function localDay(at, timeZone) {
  const units = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(at);
  const part = type => units.find(unit => unit.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validDay(value, label) {
  if (typeof value !== 'string' || !dayPattern.test(value)) throw new Error(`${label}须采用 YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label}无效`);
  return value;
}

function occurrence(value, stamp, timeZone) {
  if (value === undefined) return stamp;
  if (value === null) return null;
  if (typeof value === 'string' && dayPattern.test(value)) {
    const day = validDay(value, '作答时间');
    if (day > localDay(new Date(stamp), timeZone)) throw new Error('作答时间不能晚于入库时间');
    return day;
  }
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:[0-5]\d)$/.exec(value);
  if (!match) throw new Error('作答时间须为 YYYY-MM-DD 或带时区的 ISO 时间戳');
  validDay(match[1], '作答时间');
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error('作答时间无效');
  if (timestamp > Date.parse(stamp)) throw new Error('作答时间不能晚于入库时间');
  return new Date(timestamp).toISOString();
}

function attemptTimes(attempt) {
  return {
    occurredAt: Object.hasOwn(attempt, 'occurredAt') ? attempt.occurredAt : attempt.at,
    recordedAt: attempt.recordedAt ?? attempt.at,
  };
}

function dayOfOccurrence(occurredAt, timeZone) {
  if (!occurredAt) return null;
  return dayPattern.test(occurredAt) ? occurredAt : localDay(new Date(occurredAt), timeZone);
}

function recentAttempts(attempts, timeZone, limit) {
  return attempts.map(attempt => {
    const { occurredAt } = attemptTimes(attempt);
    return { attempt, day: dayOfOccurrence(occurredAt, timeZone) ?? '', time: occurredAt ?? '' };
  }).sort((a, b) => b.day.localeCompare(a.day) || b.time.localeCompare(a.time) ||
    b.attempt.recordedRevision - a.attempt.recordedRevision).slice(0, limit).map(({ attempt }) => attempt);
}

function attemptRecord(attempt) {
  const times = attemptTimes(attempt);
  return { ...attempt, ...times, at: times.recordedAt };
}

const id = (prefix, count) => `${prefix}-${String(count + 1).padStart(4, '0')}`;
const chapterId = value => choice(value, chapters.map(([key]) => key), '章节');

function find(list, key, label) {
  const item = list.find(item => item.id === key);
  if (!item) throw new Error(`找不到${label} ${key}`);
  return item;
}

function questionFields(value) {
  const input = record(value, '题目');
  return {
    statement: string(input.statement, '题面'),
    chapter: chapterId(input.chapter),
    title: optionalText(input.title, '题目标题', 100),
    sourceType: choice(input.sourceType ?? 'other', ['textbook', 'exam', 'generated', 'other'], '来源类型'),
    source: optionalText(input.source, '题目出处', 240),
    sourceNumber: optionalText(input.sourceNumber, '来源题号', 100),
  };
}

function normalizeSource(value) {
  return value?.normalize('NFC').trim().replace(/\s+/g, ' ') ?? '';
}

function normalizeStatement(value) {
  // Preserve line breaks and whitespace between tokens, which can distinguish matrices and variables.
  return value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')
    .replace(/ *([→←↔=≤≥<>\/×÷+−-]) */g, '$1').replace(/ +$/gm, '');
}

function sameQuestion(left, right) {
  return left.sourceType === right.sourceType && normalizeSource(left.source) === normalizeSource(right.source) &&
    (!left.sourceNumber || !right.sourceNumber || normalizeSource(left.sourceNumber) === normalizeSource(right.sourceNumber)) &&
    normalizeStatement(left.statement) === normalizeStatement(right.statement);
}

function saveQuestion(data, input, stamp) {
  const fields = questionFields(input);
  const matches = data.questions.filter(entry => sameQuestion(entry, fields));
  const exact = fields.sourceNumber ? matches.filter(entry =>
    normalizeSource(entry.sourceNumber) === normalizeSource(fields.sourceNumber)) : [];
  const candidates = exact.length ? exact : matches;
  if (candidates.length > 1) throw new Error('存在多道符合的已存题目，请先确认并指定 Q-ID');
  const previous = candidates[0];
  const pending = input.pending === true;
  const solution = optionalText(input.internalSolution, '已核验答案');
  if (pending && !solution) throw new Error('待答题需要已核验答案');
  if (previous) {
    if (!previous.sourceNumber && fields.sourceNumber) previous.sourceNumber = fields.sourceNumber;
    if (pending && previous.status === 'unattempted') {
      previous.status = 'pending';
      previous.solution = solution;
    }
    return previous;
  }
  const question = {
    ...fields, id: id('Q', data.questions.length), createdAt: stamp,
    status: pending ? 'pending' : 'unattempted', hints: 0, revealed: false, solution,
  };
  data.questions.push(question);
  return question;
}

function attemptValues(input, question) {
  const reported = input.hints === undefined ? null : integer(input.hints, 0, 4, '提示层级');
  const hints = question.hints > 0 ? Math.max(question.hints, reported ?? 0) : reported;
  const result = choice(input.result, results, '作答结果');
  if (result === 'independent_correct' && hints !== 0) {
    throw new Error('独立正确需要确认未使用提示及未查看答案');
  }
  return {
    answer: string(input.answer, '原始作答或用户确切描述'),
    result, hints, diagnostic: optionalText(input.diagnostic, '诊断'),
    confirmedCause: optionalText(input.confirmedCause, '已确认错因', 180),
    seconds: input.seconds === undefined ? null : integer(input.seconds, 0, 86400, '实际秒数'),
  };
}

function linkError(data, question, result) {
  const existing = data.errors.find(error => error.questionId === question.id);
  if (existing || !wrongResults.has(result)) return existing?.id ?? null;
  const prefix = `M2-${question.chapter.slice(0, 2)}`;
  const entry = { id: id(prefix, data.errors.filter(error => error.id.startsWith(prefix)).length), questionId: question.id };
  data.errors.push(entry);
  return entry.id;
}

function recordAttempt(data, input, stamp) {
  const sourceKey = string(input.sourceKey, '作答来源键', 250);
  const answer = string(input.answer, '原始作答或用户确切描述');
  const previous = data.attempts.find(attempt => attempt.sourceKey === sourceKey);
  if (previous) {
    const question = find(data.questions, previous.questionId, '题目');
    const matchesQuestion = input.questionId ? input.questionId === question.id : sameQuestion(question, questionFields(input.question));
    if (!matchesQuestion || previous.answer !== answer) throw new Error('作答来源键已用于不同题面或作答，请核对原记录');
    return { replay: previous.receipt };
  }
  const question = input.questionId ? find(data.questions, input.questionId, '题目') : saveQuestion(data, input.question, stamp);
  const values = attemptValues(input, question);
  const attempt = { ...values, id: id('A', data.attempts.length), questionId: question.id,
    sourceKey, at: stamp, occurredAt: occurrence(input.occurredAt, stamp, data.profile.timeZone ?? defaultTimeZone),
    recordedAt: stamp, recordedRevision: data.revision + 1, corrections: [] };
  data.attempts.push(attempt);
  question.status = 'attempted';
  question.hints = 0;
  return { questionId: question.id, attemptId: attempt.id, errorId: linkError(data, question, attempt.result) };
}

function assessment(data, input, stamp) {
  const chapter = chapterId(input.chapter);
  const target = string(input.target, '知识点、方法或公式名称', 180);
  const level = integer(input.level, 1, 5, '掌握等级');
  if (!Array.isArray(input.evidence) || !input.evidence.length) throw new Error('掌握度需要已保存的作答证据');
  const evidence = [...new Set(input.evidence)];
  const entries = evidence.map(key => find(data.attempts, key, '作答'));
  if (entries.some(entry => find(data.questions, entry.questionId, '题目').chapter !== chapter)) throw new Error('作答证据必须属于该章节');
  const independent = entries.filter(entry => entry.result === 'independent_correct');
  const distinct = new Set(independent.map(entry => entry.questionId)).size;
  if ((level >= 3 && distinct < 1) || (level >= 4 && distinct < 2)) throw new Error('独立正确的同类题证据不足');
  if (level === 5 && !hasSpacedEvidence(independent, data.profile.timeZone ?? defaultTimeZone)) {
    throw new Error('稳定掌握需要在两种独立题面之外增加至少 7 天后的间隔验证');
  }
  const note = string(input.note, '等级判断依据');
  const entriesForChapter = data.assessments[chapter] ?? [];
  const prior = entriesForChapter.find(entry => entry.target === target);
  const evidenceRows = entries.map(entry => [entry.id, entry.result]);
  const current = { target, level, evidence, evidenceRows, note, at: stamp, history: prior ? [...prior.history, {
    level: prior.level, evidence: prior.evidence, note: prior.note, at: prior.at,
  }] : [] };
  data.assessments[chapter] = [...entriesForChapter.filter(entry => entry.target !== target), current];
  return { chapter, target, level };
}

function hasSpacedEvidence(independent, timeZone) {
  const firstCorrect = new Map();
  for (const entry of independent) {
    const day = dayOfOccurrence(attemptTimes(entry).occurredAt, timeZone);
    if (!day) continue;
    const time = Date.parse(day);
    firstCorrect.set(entry.questionId, Math.min(time, firstCorrect.get(entry.questionId) ?? time));
  }
  const dates = [...firstCorrect.values()].sort((a, b) => a - b);
  return dates.length >= 3 && dates.at(-1) - dates[1] >= 7 * 86400000;
}

const reviewQuestionId = review => review.assignedQuestionId ?? review.questionId;
const reviewOpen = review => review.status === 'pending' || review.status === 'needs_review';

function eligibleReviewEvidence(attempt, review, timeZone) {
  if (attempt.questionId !== reviewQuestionId(review) || attempt.result === 'unverified' ||
      attempt.result === 'unfinished' || attempt.recordedRevision <= review.scheduledRevision) return false;
  const { occurredAt } = attemptTimes(attempt);
  if (!occurredAt) return false;
  const assignedAt = review.assignedAt ?? review.createdAt;
  return dayPattern.test(occurredAt)
    ? occurredAt > localDay(new Date(assignedAt), timeZone)
    : Date.parse(occurredAt) >= Date.parse(assignedAt);
}

function invalidateReviewEvidence(data, attempt, stamp, reason) {
  const timeZone = data.profile.timeZone ?? defaultTimeZone;
  const reopened = [];
  for (const review of data.reviews) {
    if (review.status !== 'completed' || review.attemptId !== attempt.id || eligibleReviewEvidence(attempt, review, timeZone)) continue;
    review.completionHistory ??= [];
    review.completionHistory.push({ attemptId: review.attemptId, completedAt: review.completedAt, reopenedAt: stamp, reason });
    delete review.attemptId;
    delete review.completedAt;
    const successor = data.reviews.some(entry => entry.questionId === review.questionId && entry.status === 'pending');
    review.status = successor ? 'needs_review' : 'pending';
    reopened.push(review.id);
  }
  return reopened;
}

function reviewEvidenceAlreadyUsed(reviews, reviewId, attemptId) {
  return reviews.some(review => review.id !== reviewId &&
    (review.attemptId === attemptId || review.completionHistory?.some(entry => entry.attemptId === attemptId)));
}

function planReview(data, input, stamp) {
  const question = find(data.questions, input.questionId, '题目');
  const active = input.reviewId
    ? find(data.reviews, input.reviewId, '复习任务')
    : data.reviews.find(review => review.questionId === question.id && reviewOpen(review));
  if (active && (!reviewOpen(active) || active.questionId !== question.id)) throw new Error('只能调整同一原题的待复习任务');
  if (active && !input.reviewId) throw new Error(`已有下一步复习任务 ${active.id}，改期时请提供它的 ID`);
  const assignedQuestionId = input.assignedQuestionId === undefined
    ? (active ? reviewQuestionId(active) : question.id)
    : find(data.questions, input.assignedQuestionId, '实际练习题').id;
  const values = { due: validDay(input.due, '复习日期'), priority: choice(input.priority ?? 'P2', ['P0', 'P1', 'P2', 'P3', 'P4'], '优先级'),
    minutes: integer(input.minutes, 1, 480, '估计分钟'), title: optionalText(input.title, '任务名', 120), assignedQuestionId };
  if (active) {
    if (assignedQuestionId !== reviewQuestionId(active)) {
      active.assignedAt = stamp;
      active.scheduledRevision = data.revision + 1;
    }
    Object.assign(active, values);
    return { reviewId: active.id };
  }
  const review = { ...values, id: id('R', data.reviews.length), questionId: question.id,
    status: 'pending', createdAt: stamp, scheduledRevision: data.revision + 1 };
  data.reviews.push(review);
  return { reviewId: review.id };
}

function applyChange(data, action, payload, stamp) {
  const input = record(payload, '参数');
  switch (action) {
    case 'initialize':
      return {};
    case 'save_question': {
      const question = saveQuestion(data, input, stamp);
      return { questionId: question.id, status: question.status };
    }
    case 'record_attempt':
      return recordAttempt(data, input, stamp);
    case 'correct_attempt': {
      const attempt = find(data.attempts, input.attemptId, '作答');
      const question = find(data.questions, attempt.questionId, '题目');
      const result = choice(input.result ?? attempt.result, results, '作答结果');
      if (result === 'independent_correct' && attempt.hints !== 0) throw new Error('缺少未用提示的证据');
      const reason = string(input.reason, '修订依据');
      attempt.corrections.push({ at: stamp, reason, result: attempt.result, diagnostic: attempt.diagnostic,
        confirmedCause: attempt.confirmedCause, occurredAt: attemptTimes(attempt).occurredAt });
      const resultChanged = attempt.result !== result;
      attempt.result = result;
      if (input.occurredAt !== undefined) {
        attempt.occurredAt = occurrence(input.occurredAt, attemptTimes(attempt).recordedAt, data.profile.timeZone ?? defaultTimeZone);
      }
      if (input.diagnostic !== undefined) attempt.diagnostic = optionalText(input.diagnostic, '诊断');
      if (input.confirmedCause !== undefined) attempt.confirmedCause = optionalText(input.confirmedCause, '已确认错因', 180);
      if (resultChanged && !wrongResults.has(result) && input.confirmedCause === undefined) attempt.confirmedCause = null;
      const reopened = invalidateReviewEvidence(data, attempt, stamp, reason);
      return { questionId: question.id, attemptId: attempt.id, errorId: linkError(data, question, result),
        ...(reopened.length ? { reopenedReviewIds: reopened } : {}) };
    }
    case 'set_coverage': {
      const chapter = chapterId(input.chapter);
      const coverage = choice(input.coverage, ['unknown', 'not_started', 'learning', 'learned'], '覆盖状态');
      data.coverage[chapter] = { coverage, evidence: string(input.evidence, '课程进度依据'), at: stamp };
      return { chapter, coverage };
    }
    case 'set_mastery':
      return assessment(data, input, stamp);
    case 'schedule_review':
      return planReview(data, input, stamp);
    case 'complete_review': {
      const review = find(data.reviews, input.reviewId, '复习任务');
      const attempt = find(data.attempts, input.attemptId, '作答');
      if (!reviewOpen(review) || !eligibleReviewEvidence(attempt, review, data.profile.timeZone ?? defaultTimeZone) ||
          reviewEvidenceAlreadyUsed(data.reviews, review.id, attempt.id)) {
        throw new Error('任务需要一条排期后完成、已核验且未用于其他任务的指定题作答');
      }
      Object.assign(review, { status: 'completed', attemptId: attempt.id, completedAt: stamp });
      return { reviewId: review.id };
    }
    case 'save_hint': {
      const question = find(data.questions, input.questionId, '题目');
      question.hints = Math.max(question.hints, integer(input.level, 1, 3, '提示层级'));
      return { questionId: question.id, hints: question.hints };
    }
    case 'reveal_solution': {
      const question = find(data.questions, input.questionId, '题目');
      if (!question.solution) throw new Error('没有已保存的答案');
      question.revealed = true;
      question.hints = 4;
      return { questionId: question.id, solution: question.solution };
    }
    case 'set_profile': {
      const profile = { ...data.profile };
      if (input.examYear !== undefined) profile.examYear = integer(input.examYear, 2000, 2100, '考试年');
      if (input.targetScore !== undefined) profile.targetScore = integer(input.targetScore, 0, 150, '目标分');
      if (input.reviewMinutes !== undefined) profile.reviewMinutes = integer(input.reviewMinutes, 1, 480, '复习预算');
      if (input.preferences !== undefined) profile.preferences = string(input.preferences, '已确认长期偏好');
      if (input.timeZone !== undefined) {
        profile.timeZone = string(input.timeZone, '时区', 100);
        localDay(new Date(stamp), profile.timeZone);
      }
      data.profile = profile;
      return { profile };
    }
    case 'save_note': {
      const kind = choice(input.kind, ['knowledge', 'method', 'formula', 'relation', 'teaching', 'plan'], '笔记类型');
      const chapter = input.chapter === undefined ? null : chapterId(input.chapter);
      const title = string(input.title, '标题', 140);
      const body = string(input.body, '笔记', 24000);
      const previous = data.notes.find(note => note.kind === kind && note.chapter === chapter && note.title === title);
      if (previous) {
        previous.history.push({ body: previous.body, at: previous.at });
        Object.assign(previous, { body, at: stamp });
        return { noteId: previous.id };
      }
      const prefix = { knowledge: 'K', method: 'M', formula: 'F', relation: 'G', teaching: 'T', plan: 'P' }[kind];
      const note = { kind, chapter, title, body, at: stamp, history: [], id: id(prefix, data.notes.filter(entry => entry.kind === kind).length) };
      data.notes.push(note);
      return { noteId: note.id };
    }
    default:
      throw new Error('未知学习操作');
  }
}

function assessmentView(entry, attempts, timeZone) {
  if (!entry) return null;
  const { history, evidenceRows, ...details } = entry;
  const needsReview = evidenceRows.some(([key, result]) => attempts.get(key)?.result !== result) ||
    (entry.level === 5 && !hasSpacedEvidence(evidenceRows.filter(([, result]) => result === 'independent_correct')
      .map(([key]) => attempts.get(key)), timeZone));
  return { ...details, level: needsReview ? null : entry.level, needsReview };
}

function sortedReviews(reviews) {
  return reviews.sort((a, b) => a.priority.localeCompare(b.priority) || a.due.localeCompare(b.due));
}

function reviewSummary(review, question) {
  return {
    id: review.id, title: review.title ?? question.title ?? question.id, status: review.status,
    due: review.due, minutes: review.minutes, priority: review.priority, chapter: question.chapter,
    questionId: question.id, sourceQuestionId: review.questionId,
    reviewKind: question.id === review.questionId ? 'original' : 'variant',
  };
}

function dashboardOf(data, now) {
  const zone = data.profile.timeZone ?? defaultTimeZone;
  const today = localDay(now, zone);
  const questions = new Map(data.questions.map(question => [question.id, question]));
  const attempts = new Map(data.attempts.map(attempt => [attempt.id, attempt]));
  const activeErrors = new Set(data.attempts.filter(attempt => wrongResults.has(attempt.result)).map(attempt => attempt.questionId));
  const pending = data.reviews.filter(reviewOpen);
  const due = sortedReviews(pending.filter(review => review.due <= today));
  const attemptsByDay = new Map();
  const causes = new Map();
  for (const attempt of data.attempts) {
    const day = dayOfOccurrence(attemptTimes(attempt).occurredAt, zone);
    if (day) {
      const tally = attemptsByDay.get(day) ?? { attempts: 0, independent: 0 };
      tally.attempts++;
      if (attempt.result === 'independent_correct') tally.independent++;
      attemptsByDay.set(day, tally);
    }
    if (attempt.confirmedCause && attempt.result !== 'independent_correct') {
      const cause = causes.get(attempt.confirmedCause) ?? { count: 0, questions: new Set() };
      cause.count++;
      cause.questions.add(attempt.questionId);
      causes.set(attempt.confirmedCause, cause);
    }
  }
  const series = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + i - 13);
    const day = date.toISOString().slice(0, 10);
    return { day, ...(attemptsByDay.get(day) ?? { attempts: 0, independent: 0 }) };
  });
  return {
    initialized: data.revision > 0, revision: data.revision, updatedAt: data.updatedAt, today, timeZone: zone,
    counts: {
      questions: data.questions.length, attempts: data.attempts.length, errors: activeErrors.size,
      independent: data.attempts.filter(attempt => attempt.result === 'independent_correct').length,
      due: due.length, needsReview: pending.filter(review => review.status === 'needs_review').length,
      learned: Object.values(data.coverage).filter(entry => entry.coverage === 'learned').length,
    },
    target: { examYear: data.profile.examYear ?? null, score: data.profile.targetScore ?? null, reviewMinutes: data.profile.reviewMinutes ?? null },
    series,
    chapters: chapters.map(([id, title]) => {
      const view = assessmentView(data.assessments[id]?.at(-1), attempts, zone);
      return { id, title, coverage: data.coverage[id]?.coverage ?? 'unknown',
        mastery: view?.level ?? null, masteryTarget: view?.target ?? null,
        needsReview: view?.needsReview ?? false, evidenceCount: view?.evidence.length ?? 0 };
    }),
    dueReviews: due.slice(0, 12).map(review => reviewSummary(review, questions.get(reviewQuestionId(review)))),
    upcomingReviews: pending.filter(review => review.due > today).length,
    causes: [...causes].map(([label, value]) => ({ label, count: value.count, distinct: value.questions.size }))
      .sort((a, b) => b.distinct - a.distinct || b.count - a.count).slice(0, 5),
    recent: recentAttempts(data.attempts, zone, 6).map(attempt => {
      const question = questions.get(attempt.questionId);
      const times = attemptTimes(attempt);
      return { id: attempt.id, questionId: attempt.questionId, title: question.title ?? question.id,
        chapter: question.chapter, result: attempt.result, at: times.recordedAt, ...times };
    }),
  };
}

function readStudy(db) {
  const row = db.prepare('SELECT payload FROM study WHERE id = 1').get();
  if (!row) return emptyStudy();
  const data = JSON.parse(row.payload);
  if (data.format !== 1) throw new Error('学习库格式不兼容');
  return data;
}

function fingerprint(value) {
  if (Array.isArray(value)) return value.map(fingerprint);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, fingerprint(value[key])]));
  return value;
}

export function createStudyStore(file) {
  function read() {
    let size;
    try { size = statSync(file).size; } catch (error) {
      if (error.code === 'ENOENT') return emptyStudy();
      throw error;
    }
    if (size === 0) throw new Error('学习库为空文件，待检查');
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout = 2500');
      return readStudy(db);
    } finally { db.close(); }
  }

  return {
    dashboard: (now = new Date()) => dashboardOf(read(), now),
    readDashboardDetail(id) {
      if (typeof id !== 'string' || !/^[AR]-\d{4,}$/.test(id)) return null;
      const data = read();
      if (id.startsWith('R-')) {
        const review = data.reviews.find(entry => entry.id === id);
        if (!review) return null;
        const question = find(data.questions, reviewQuestionId(review), '实际练习题');
        return { kind: 'review', ...reviewSummary(review, question), statement: question.statement };
      }
      const attempt = data.attempts.find(entry => entry.id === id);
      if (!attempt) return null;
      const question = find(data.questions, attempt.questionId, '题目');
      return { kind: 'attempt', id: attempt.id, questionId: question.id, title: question.title ?? question.id,
        chapter: question.chapter, statement: question.statement, source: question.source,
        answer: attempt.answer, diagnostic: attempt.diagnostic, confirmedCause: attempt.confirmedCause,
        result: attempt.result, hints: attempt.hints, ...attemptTimes(attempt) };
    },
    read(query = {}) {
      const data = read();
      const zone = data.profile.timeZone ?? defaultTimeZone;
      if (query.sourceKey !== undefined) {
        const key = string(query.sourceKey, '作答来源键', 250);
        const attempt = data.attempts.find(entry => entry.sourceKey === key);
        return { attempt: attempt ? attemptRecord(attempt) : null };
      }
      const chapter = query.chapter ? chapterId(query.chapter) : null;
      const offset = query.offset === undefined ? 0 : integer(query.offset, 0, 1000000, '查询偏移量');
      if (query.search !== undefined) {
        const text = string(query.search, '检索关键词', 240).toLowerCase();
        const matches = data.questions.filter(question => (!chapter || question.chapter === chapter) &&
          [question.id, question.title, question.statement, question.source, question.sourceNumber].some(field => field?.toLowerCase().includes(text)));
        const questions = matches.slice(offset, offset + 20).map(({ id, title, chapter, source, sourceNumber, status, statement }) =>
          ({ id, title, chapter, source, sourceNumber: sourceNumber ?? null, status, excerpt: statement.slice(0, 200) }));
        return { questions, total: matches.length, nextOffset: offset + 20 < matches.length ? offset + 20 : null };
      }
      if (query.reviewStatus !== undefined) {
        const status = choice(query.reviewStatus, ['due', 'pending', 'completed', 'needs_review'], '复习状态');
        const today = query.today ? validDay(query.today, '截止日期') : localDay(new Date(), zone);
        const questions = new Map(data.questions.map(question => [question.id, question]));
        const matches = sortedReviews(data.reviews.filter(review => {
          const matchesStatus = status === 'due' ? reviewOpen(review) && review.due <= today : review.status === status;
          return matchesStatus && (!chapter || questions.get(reviewQuestionId(review)).chapter === chapter);
        }));
        return { reviews: matches.slice(offset, offset + 20), total: matches.length, nextOffset: offset + 20 < matches.length ? offset + 20 : null };
      }
      if (!query.id) {
        const pending = data.questions.filter(question => question.status === 'pending')
          .slice(-8).map(({ id, title, chapter, hints }) => ({ id, title, chapter, hints }));
        const attempts = chapter ? new Map(data.attempts.map(attempt => [attempt.id, attempt])) : null;
        return { dashboard: dashboardOf(data, new Date()), profile: data.profile, pending,
          ...(chapter ? { chapter: { coverage: data.coverage[chapter] ?? null,
            assessments: (data.assessments[chapter] ?? []).slice(-8).map(entry => assessmentView(entry, attempts, zone)) } } : {}),
          notes: data.notes.filter(note => !chapter || note.chapter === chapter).slice(-12).map(({ id, kind, chapter, title }) => ({ id, kind, chapter, title })) };
      }
      if (query.id.startsWith('Q-') || query.id.startsWith('M2-')) {
        const key = query.id.startsWith('M2-') ? find(data.errors, query.id, '错题').questionId : query.id;
        const { solution, ...question } = find(data.questions, key, '题目');
        const attempts = recentAttempts(data.attempts.filter(attempt => attempt.questionId === key), zone, 10).map(attemptRecord);
        return { question, attempts, ...(solution && (question.revealed || attempts.length) ? { solution } : {}) };
      }
      if (query.id.startsWith('A-')) return { attempt: attemptRecord(find(data.attempts, query.id, '作答')) };
      if (query.id.startsWith('R-')) return { review: find(data.reviews, query.id, '计划') };
      return { note: find(data.notes, query.id, '笔记') };
    },
    change(operationId, action, payload, now = new Date()) {
      const key = string(operationId, '请求标识', 400);
      const command = JSON.stringify(fingerprint({ action, payload }));
      const stamp = now.toISOString();
      mkdirSync(dirname(file), { recursive: true });
      const db = new DatabaseSync(file);
      try {
        db.exec(`PRAGMA busy_timeout = 2500;
          CREATE TABLE IF NOT EXISTS study (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, command TEXT NOT NULL, receipt TEXT NOT NULL);
          BEGIN IMMEDIATE`);
        const previous = db.prepare('SELECT command, receipt FROM operations WHERE id = ?').get(key);
        let receipt;
        if (previous) {
          if (previous.command !== command) throw new Error('请求标识已用于不同变更');
          receipt = JSON.parse(previous.receipt);
        } else {
          const data = readStudy(db);
          const result = applyChange(data, action, payload, stamp);
          if (result.replay) {
            receipt = result.replay;
          } else {
            data.revision++;
            data.updatedAt = stamp;
            data.format = 1;
            receipt = { ...result, revision: data.revision, transactionId: `TX-${stamp.slice(0, 10).replaceAll('-', '')}-${String(data.revision).padStart(4, '0')}` };
            if (action === 'record_attempt') find(data.attempts, result.attemptId, '作答').receipt = receipt;
            db.prepare('INSERT INTO study (id, payload) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET payload = excluded.payload')
              .run(JSON.stringify(data));
          }
          db.prepare('INSERT INTO operations (id, command, receipt) VALUES (?, ?, ?)').run(key, command, JSON.stringify(receipt));
        }
        db.exec('COMMIT');
        const committed = db.prepare('SELECT receipt FROM operations WHERE id = ?').get(key);
        if (!committed || committed.receipt !== JSON.stringify(receipt)) throw new Error('提交回读核验失败');
        return receipt;
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        throw error;
      } finally { db.close(); }
    },
  };
}
