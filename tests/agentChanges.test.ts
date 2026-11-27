// 运行：node --test tests/*.test.ts
// 按需求写的几条：什么情况下 Claude 的改动单该执行、该等、该拒绝。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_EDITABLE_DIARY_IDS,
  canUndoAgentChange,
  decideAgentChange,
  decideAgentPlan,
  hashContent,
  insertTodayPlan,
  parseAgentChange,
} from '../src/utils/agentChanges.ts';

const LONG_TERM = AGENT_EDITABLE_DIARY_IDS[0];
const longTerm = { id: LONG_TERM };
const ownDiary = { id: 'diary-1' };
const BASE = 'hash-of-what-claude-read';

const change = (overrides: Record<string, unknown> = {}) =>
  parseAgentChange(JSON.stringify({
    id: 'c1',
    kind: 'replace_content',
    diaryId: LONG_TERM,
    baseContentHash: BASE,
    markdown: '## 长期任务\n\n- 一件事',
    summary: '整理长期任务',
    createdAt: 2000,
    ...overrides,
  }));

test('读到的版本还是最新、这篇没开着：执行', () => {
  assert.deepEqual(decideAgentChange(change()!, [longTerm], null, BASE), { kind: 'apply' });
});

test('Claude 读过之后他又改过：拒绝，不盖掉他的改动', () => {
  assert.equal(decideAgentChange(change()!, [longTerm], null, 'hash-after-his-edit').kind, 'reject');
});

test('这篇正开着：先等，不拒绝', () => {
  assert.equal(decideAgentChange(change()!, [longTerm], LONG_TERM, BASE).kind, 'wait');
});

test('开着的是别的日记：照常执行', () => {
  assert.equal(decideAgentChange(change()!, [longTerm], 'diary-1', BASE).kind, 'apply');
});

test('他自己写的日记：不在允许范围，拒绝', () => {
  const decision = decideAgentChange(change({ diaryId: 'diary-1' })!, [longTerm, ownDiary], null, BASE);
  assert.equal(decision.kind, 'reject');
});

test('新内容是空的：拒绝，不把文档清空', () => {
  assert.equal(decideAgentChange(change({ markdown: '  \n' })!, [longTerm], null, BASE).kind, 'reject');
});

test('文档不存在：拒绝', () => {
  assert.equal(decideAgentChange(change()!, [], null, null).kind, 'reject');
});

test('格式不对的单子读不出来', () => {
  assert.equal(parseAgentChange('not json'), null);
  assert.equal(change({ kind: 'delete' }), null);
  assert.equal(change({ baseContentHash: undefined }), null);
  assert.equal(change({ html: '<p>x</p>' }), null); // markdown 和 html 只能给一个
  assert.equal(change({ markdown: undefined }), null); // 一个都没给
});

test('改完后没人动过：可以撤销；他又改了：不能撤销', () => {
  assert.equal(canUndoAgentChange({ content: '<p>新</p>' }, '<p>新</p>'), true);
  assert.equal(canUndoAgentChange({ content: '<p>新</p><p>他补的</p>' }, '<p>新</p>'), false);
  assert.equal(canUndoAgentChange(undefined, '<p>新</p>'), false);
});

test('哈希和 Node 自带的 sha256 一致，脚本和 App 算出来的对得上', async () => {
  const { createHash } = await import('node:crypto');
  const html = '<h2>长期任务</h2><ul><li><p>张和</p></li></ul>';
  assert.equal(await hashContent(html), createHash('sha256').update(html, 'utf8').digest('hex'));
});

// ── 往当天日记的「今日计划」加待办 ──

const plan = (overrides: Record<string, unknown> = {}) =>
  parseAgentChange(JSON.stringify({
    id: 'p1',
    kind: 'add_today_plan',
    day: '2026-11-27',
    items: ['学第 5 节', '约访谈'],
    summary: '今天建议做',
    ...overrides,
  }));

const day27 = { id: 'd27', title: '20261127-周五', createdAt: new Date(2026, 10, 27, 9).getTime() };
const day26 = { id: 'd26', title: '20261126-助教', createdAt: new Date(2026, 10, 26, 9).getTime() };

test('计划单格式：没有条目或日期不对就不认', () => {
  assert.equal(plan({ items: [] }), null);
  assert.equal(plan({ items: ['  '] }), null);
  assert.equal(plan({ day: '11-27' }), null);
  assert.equal(plan()!.kind, 'add_today_plan');
});

test('那天的日记还没建：等，不拒绝', () => {
  assert.equal(decideAgentPlan(plan() as never, [day26], null, '2026-11-27').kind, 'wait');
});

test('建好了且没开着：加到按标题日期认出的那一篇', () => {
  assert.deepEqual(decideAgentPlan(plan() as never, [day26, day27], null, '2026-11-27'), { kind: 'apply', diaryId: 'd27' });
});

test('标题日期是 26 号、27 号凌晨才建的补写：不算 27 号', () => {
  const backfill = { id: 'b', title: '20261126-补写', createdAt: new Date(2026, 10, 27, 1).getTime() };
  assert.equal(decideAgentPlan(plan() as never, [backfill], null, '2026-11-27').kind, 'wait');
});

test('长期任务和模板不算那天的日记', () => {
  const longTermToday = { id: LONG_TERM, title: '长期任务', createdAt: new Date(2026, 10, 27, 9).getTime() };
  assert.equal(decideAgentPlan(plan() as never, [longTermToday], null, '2026-11-27').kind, 'wait');
});

test('那篇正开着：等；过了那天：作废', () => {
  assert.equal(decideAgentPlan(plan() as never, [day27], 'd27', '2026-11-27').kind, 'wait');
  assert.equal(decideAgentPlan(plan() as never, [day27], null, '2026-11-28').kind, 'reject');
});

test('插在「今日计划」标题正下方，他原有的条目留在后面', () => {
  const content = '<h2>流水账</h2><p>写了点</p><h2>今日计划</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>他自己的</p></div></li></ul>';
  const { html, added } = insertTodayPlan(content, ['学第 5 节']);
  assert.deepEqual(added, ['学第 5 节']);
  assert.ok(html.startsWith('<h2>流水账</h2><p>写了点</p><h2>今日计划</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false">'));
  assert.ok(html.indexOf('学第 5 节') < html.indexOf('他自己的'));
});

test('已经有的条目不重复加；全都有就什么都不改', () => {
  const content = '<h2>今日计划</h2><ul><li><p>学第 5 节</p></li></ul>';
  assert.deepEqual(insertTodayPlan(content, ['学第 5 节', '约访谈']).added, ['约访谈']);
  assert.equal(insertTodayPlan(content, ['学第5节']).html, content);
});

test('没有「今日计划」标题就在末尾补一节；尖括号转义', () => {
  const { html } = insertTodayPlan('<p>只有正文</p>', ['看 <a> 标签']);
  assert.ok(html.startsWith('<p>只有正文</p><h2>今日计划</h2>'));
  assert.ok(html.includes('看 &lt;a&gt; 标签'));
});
