import { readFileSync } from 'node:fs';
import { createStudyStore } from './study.mjs';
import { databasePath } from './index.mjs';

export const name = 'math2-study-tools';
export const inject = ['tools'];

const skills = new Map([
  ['core', 'AGENTS.md'], ['01', '01_错题分析.md'], ['02', '02_数学教学.md'],
  ['03', '03_知识库管理.md'], ['04', '04_掌握度评估.md'], ['05', '05_变式训练.md'],
  ['06', '06_复习计划.md'], ['07', '07_短板诊断.md'], ['08', '08_人设管理.md'],
  ['09', '09_上下文恢复.md'], ['10', '10_迁移与备份.md'], ['11', '11_自我审查.md'],
  ['12', '12_学习规划.md'],
]);

const operations = {
  initialize: '{}',
  save_question: '{statement, chapter, title?, sourceType?, source?, pending?, internalSolution?}',
  record_attempt: '{questionId 或 question, sourceKey, answer, result, hints?, diagnostic?, confirmedCause?, seconds?}',
  correct_attempt: '{attemptId, reason, result?, diagnostic?, confirmedCause?}',
  set_coverage: '{chapter, coverage, evidence}',
  set_mastery: '{chapter, target: 知识点/方法/公式名称, level, evidence: [A-ID], note}',
  schedule_review: '{questionId, due, minutes, priority?, title?, reviewId?}',
  complete_review: '{reviewId, attemptId}',
  save_hint: '{questionId, level}',
  reveal_solution: '{questionId}',
  set_profile: '{examYear?, targetScore?, reviewMinutes?, preferences?, timeZone?}',
  save_note: '{kind, chapter?, title, body}',
};

const str = description => ({ type: 'string', description });
const output = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: value.guidance ?? JSON.stringify(value) }],
};

function argumentsObject(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数须为对象');
  return args;
}

export function apply(ctx) {
  const store = createStudyStore(databasePath());
  ctx.tools.register({
    name: 'math2_read',
    description: '只读查询学习看板、到期复习、题目、作答记录或教学技能。缺省返回学习概览。',
    parameters: { type: 'object', additionalProperties: false, properties: {
      skill: { ...str('core 或技能编号'), enum: [...skills.keys()] },
      id: str('题目、作答、复习或笔记 ID'),
      chapter: str('按章节筛选，例如 GS01'),
      sourceKey: str('按稳定来源键找回原作答和事务'),
      search: str('按关键词搜索题面、标题、Q-ID 或来源'),
      reviewStatus: { ...str('复习任务列表和下一页偏移量'), enum: ['due', 'pending', 'completed'] },
      offset: { type: 'integer', description: '列表下一页偏移量，默认 0' },
      today: str('查询到期复习时可传截止日期 YYYY-MM-DD，默认为用户时区的今天'),
      operations: { type: 'boolean', description: '返回写入操作的参数及可选值' },
    } },
    output,
    async execute(args) {
      const input = argumentsObject(args);
      if (input.skill !== undefined) {
        const file = skills.get(input.skill);
        if (!file) throw new Error('未知技能编号');
        const text = readFileSync(new URL(`./guidance/${file}`, import.meta.url), 'utf8');
        return { guidance: `DSH 适配约定：下文的文件路径和 Markdown 写入协议作为参考。实际读写走 math2_read / math2_write，提交状态以本地 SQLite 事务回执为准。\n\n${text}` };
      }
      if (input.operations === true) return {
        operations,
        chapters: 'GS01–GS06、LA01–LA06',
        result: ['wrong', 'unfinished', 'guessed', 'hinted_correct', 'independent_correct', 'unverified'],
        coverage: ['unknown', 'not_started', 'learning', 'learned'],
        sourceType: ['textbook', 'exam', 'generated', 'other'],
        noteKind: ['knowledge', 'method', 'formula', 'relation', 'teaching', 'plan'],
      };
      if (input.id !== undefined && (typeof input.id !== 'string' || input.id.length > 80)) throw new Error('记录 ID 无效');
      return store.read(input);
    },
  });
  ctx.tools.register({
    name: 'math2_write',
    description: '持久化一项学习变更。使用 math2_read(operations=true) 查看各操作参数。用户要求只讲题或不保存时跳过。返回已回读的事务编号。',
    parameters: { type: 'object', additionalProperties: false, required: ['action', 'data'], properties: {
      action: { ...str('操作'), enum: Object.keys(operations) },
      data: { type: 'object', additionalProperties: true },
      operationId: str('可选稳定请求 ID。恢复或重试同一请求时沿用，后续修订使用新 ID。'),
    } },
    output,
    async execute(args, execution) {
      const input = argumentsObject(args);
      argumentsObject(input.data);
      execution.signal?.throwIfAborted();
      const callId = input.operationId ?? execution.callId;
      if (!callId) throw new Error('缺少可追溯的请求标识');
      return store.change(callId, input.action, input.data);
    },
  });
}
