// Claude 改 Glimmer 数据的唯一入口：它在本机 agent-inbox 文件夹里放一张改动单，
// 桌面版读到后在这里核对，过了才用和界面操作同一条路径（updateDiary）去改，
// 保存、同步、撤销都和他亲手改一样。这个文件只做判断，不碰存储，方便单独测。

import { LONG_TERM_MASTER_ID } from '../types/index.ts';
import type { Diary } from '../types/index.ts';

// 允许 Claude 改的文档。只放系统文档；他写的日记不在这里，要放开新的一篇先问他。
export const AGENT_EDITABLE_DIARY_IDS = [LONG_TERM_MASTER_ID];

export type AgentChange = {
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
  change: AgentChange,
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

// 撤销只在改完之后这篇内容没再变过时才做，否则会把他后来写的盖掉。
export const canUndoAgentChange = (
  diary: Pick<Diary, 'content'> | undefined,
  appliedContent: string,
) => diary !== undefined && diary.content === appliedContent;
