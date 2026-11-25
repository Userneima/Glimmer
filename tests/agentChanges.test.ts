// 运行：node --test tests/*.test.ts
// 按需求写的几条：什么情况下 Claude 的改动单该执行、该等、该拒绝。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_EDITABLE_DIARY_IDS,
  canUndoAgentChange,
  decideAgentChange,
  hashContent,
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
