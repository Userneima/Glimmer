// Claude 改 Glimmer 数据的唯一入口：它在本机 agent-inbox 文件夹里放一张改动单，
// 桌面版读到后在这里核对，过了才用和界面操作同一条路径（updateDiary）去改，
// 保存、同步、撤销都和他亲手改一样。这个文件只做判断，不碰存储，方便单独测。

import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID } from '../types/index.ts';
import type { Diary } from '../types/index.ts';
import { diaryDay } from './date.ts';

// 允许 Claude 改的文档。只放系统文档；他写的日记不在这里，要放开新的一篇先问他。
export const AGENT_EDITABLE_DIARY_IDS = [LONG_TERM_MASTER_ID];

// 往某一天日记的「今日计划」里加几条待办。他的日记由他自己建，Claude 不能整篇改，
// 只能在这一节最前面插入未勾选的条目；那天的日记还没建就等，过了那天就作废。
export type AgentPlanChange = {
  id: string;
  kind: 'add_today_plan';
  /** 本地日期 YYYY-MM-DD，按日记标题开头的日期认是哪一天（diaryDay）。 */
  day: string;
  items: string[];
  summary: string;
  createdAt: number;
};

export type AgentChange = AgentReplaceChange | AgentPlanChange;

export type AgentReplaceChange = {
  id: string;
  kind: 'replace_content';
  diaryId: string;
  // Claude 读到的那一版正文的 SHA-256。对不上说明之后他又改过，整张单子作废。
  // 不用 updatedAt：云同步会改写内存里的时间戳，同一版内容也会对不上（2026-11-03 实测）。
  baseContentHash: string;
  // 二选一。markdown 由 Glimmer 用粘贴时同一套转换转成正文。
  markdown?: string;
  html?: string;
  summary: string;
  createdAt: number;
};

export type AgentChangeDecision =
  | { kind: 'apply' }
  | { kind: 'wait'; reason: string }
  | { kind: 'reject'; reason: string };

export const parseAgentChange = (raw: string): AgentChange | null => {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === 'string' ? (value[key] as string) : undefined);
  if (value.kind === 'add_today_plan') {
    const items = Array.isArray(value.items)
      ? value.items.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
      : [];
    const day = text('day');
    if (!text('id') || !text('summary') || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || items.length === 0) return null;
    return {
      id: text('id')!,
      kind: 'add_today_plan',
      day,
      items,
      summary: text('summary')!,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    };
  }
  if (
    value.kind !== 'replace_content' ||
    !text('id') ||
    !text('diaryId') ||
    !text('baseContentHash') ||
    !text('summary')
  ) {
    return null;
  }
  const markdown = text('markdown');
  const html = text('html');
  if ((markdown === undefined) === (html === undefined)) return null;
  return {
    id: text('id')!,
    kind: 'replace_content',
    diaryId: text('diaryId')!,
    baseContentHash: text('baseContentHash')!,
    markdown,
    html,
    summary: text('summary')!,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
  };
};

// 网页和 Node 都有 crypto.subtle，两边算出来的一样。
export const hashContent = async (content: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

// targetHash 是这篇当前正文的 hashContent 结果，由调用方先算好（算哈希是异步的）。
export const decideAgentChange = (
  change: AgentReplaceChange,
  diaries: Pick<Diary, 'id'>[],
  openDiaryId: string | null,
  targetHash: string | null,
): AgentChangeDecision => {
  if (!AGENT_EDITABLE_DIARY_IDS.includes(change.diaryId)) {
    return { kind: 'reject', reason: '这篇不在允许 Claude 修改的范围里' };
  }
  const target = diaries.find((diary) => diary.id === change.diaryId);
  if (!target) return { kind: 'reject', reason: '找不到要改的文档' };
  if (!(change.markdown ?? change.html ?? '').trim()) {
    return { kind: 'reject', reason: '新内容是空的' };
  }
  if (targetHash !== change.baseContentHash) {
    return { kind: 'reject', reason: 'Claude 读过之后这篇又被改过' };
  }
  // 他正开着这篇时不动，免得编辑器里的内容和存下来的对不上。切到别的日记就会执行。
  if (openDiaryId === change.diaryId) {
    return { kind: 'wait', reason: '这篇正开着，切到别的日记后执行' };
  }
  return { kind: 'apply' };
};

const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const isSystem = (diary: Pick<Diary, 'id' | 'isLongTermMaster' | 'isTemplateDiary'>) =>
  diary.id === LONG_TERM_MASTER_ID || diary.id === TEMPLATE_DIARY_ID || Boolean(diary.isLongTermMaster) || Boolean(diary.isTemplateDiary);

export type AgentPlanDecision =
  | { kind: 'apply'; diaryId: string }
  | { kind: 'wait'; reason: string }
  | { kind: 'reject'; reason: string };

// today 是调用方的本地日期 YYYY-MM-DD。
export const decideAgentPlan = (
  change: AgentPlanChange,
  diaries: Pick<Diary, 'id' | 'title' | 'createdAt' | 'isLongTermMaster' | 'isTemplateDiary'>[],
  openDiaryId: string | null,
  today: string,
): AgentPlanDecision => {
  if (change.day < today) return { kind: 'reject', reason: '那一天已经过了' };
  // 同一天有两篇时取最早建的那篇，和他平时把那天当一篇看一致。
  const target = diaries
    .filter((diary) => !isSystem(diary) && localDay(diaryDay(diary)) === change.day)
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!target) return { kind: 'wait', reason: '那天的日记还没建，建好后加进今日计划' };
  if (openDiaryId === target.id) return { kind: 'wait', reason: '这篇正开着，切到别的日记后执行' };
  return { kind: 'apply', diaryId: target.id };
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, '')
    .toLowerCase();

const PLAN_HEADING = /<h([1-6])[^>]*>\s*今日计划\s*<\/h\1>/;

// 把条目插到「今日计划」标题正下方；没有这个标题就在末尾补一个。
// 正文里已经有同样文字的条目不再加（他自己写过、或上一次已经加过）。
export const insertTodayPlan = (content: string, items: string[]) => {
  const existing = plainText(content);
  const added = items.filter((item) => !existing.includes(plainText(escapeHtml(item))));
  if (added.length === 0) return { html: content, added };
  const list =
    '<ul data-type="taskList">' +
    added
      .map(
        (item) =>
          `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${escapeHtml(item)}</p></div></li>`,
      )
      .join('') +
    '</ul>';
  const match = PLAN_HEADING.exec(content);
  if (!match) return { html: `${content}<h2>今日计划</h2>${list}`, added };
  const at = match.index + match[0].length;
  return { html: content.slice(0, at) + list + content.slice(at), added };
};

// 撤销只在改完之后这篇内容没再变过时才做，否则会把他后来写的盖掉。
export const canUndoAgentChange = (
  diary: Pick<Diary, 'content'> | undefined,
  appliedContent: string,
) => diary !== undefined && diary.content === appliedContent;
