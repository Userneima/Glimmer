import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Diary } from '../types';
import { canUndoAgentChange, decideAgentChange, hashContent, parseAgentChange } from '../utils/agentChanges';
import { isTauriRuntime } from '../utils/desktopStore';
import { markdownToHtml } from '../utils/markdown';
import { showToast } from '../utils/toast';

// 桌面版每隔几秒看一眼 Claude 的改动单（规则见 utils/agentChanges.ts）。网页版没有收件箱，什么都不做。
const POLL_MS = 4000;

type ChangeFile = { fileName: string; content: string };

const writeLog = (entry: Record<string, unknown>) =>
  invoke('append_agent_log', { line: JSON.stringify({ at: new Date().toISOString(), ...entry }) }).catch((err) =>
    console.warn('[agent-inbox] log failed', err),
  );

const finish = (fileName: string, raw: string, outcome: Record<string, unknown>) => {
  let original: unknown = raw;
  try {
    original = JSON.parse(raw);
  } catch {
    // 读不出来的单子原样存下，方便看出了什么问题
  }
  const record = JSON.stringify({ change: original, outcome: { at: new Date().toISOString(), ...outcome } }, null, 2);
  return invoke('finish_agent_change', { fileName, record });
};

export const useAgentInbox = (
  diaries: Diary[],
  openDiaryId: string | null,
  updateDiary: (id: string, updates: Partial<Diary>) => void,
) => {
  // 用 ref 拿最新值，定时器只建一次。
  const diariesRef = useRef(diaries);
  const openRef = useRef(openDiaryId);
  const updateRef = useRef(updateDiary);
  diariesRef.current = diaries;
  openRef.current = openDiaryId;
  updateRef.current = updateDiary;
  const waitingNotified = useRef(new Set<string>());

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let busy = false;

    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const files = await invoke<ChangeFile[]>('list_agent_changes');
        for (const file of files) {
          const change = parseAgentChange(file.content);
          if (!change) {
            await finish(file.fileName, file.content, { result: 'rejected', reason: '改动单格式不对' });
            void writeLog({ file: file.fileName, result: 'rejected', reason: '改动单格式不对' });
            continue;
          }
          const target = diariesRef.current.find((diary) => diary.id === change.diaryId);
          const targetHash = target ? await hashContent(target.content) : null;
          const decision = decideAgentChange(change, diariesRef.current, openRef.current, targetHash);
          const title = target?.title || '这篇文档';

          if (decision.kind === 'wait') {
            if (!waitingNotified.current.has(change.id)) {
              waitingNotified.current.add(change.id);
              showToast(`Claude 改好了《${title}》，${decision.reason}`, 'info', 6000);
            }
            continue;
          }

          if (decision.kind === 'reject') {
            await finish(file.fileName, file.content, { result: 'rejected', reason: decision.reason });
            void writeLog({ changeId: change.id, diaryId: change.diaryId, summary: change.summary, result: 'rejected', reason: decision.reason });
            showToast(`Claude 的改动没执行：${decision.reason}`, 'info', 6000);
            continue;
          }

          const previous = target!.content;
          const next = change.html ?? markdownToHtml(change.markdown ?? '');
          updateRef.current(change.diaryId, { content: next });
          await finish(file.fileName, file.content, { result: 'applied', previousContent: previous, appliedContent: next });
          void writeLog({ changeId: change.id, diaryId: change.diaryId, summary: change.summary, result: 'applied' });
          waitingNotified.current.delete(change.id);

          showToast(`Claude 改了《${title}》：${change.summary}`, 'success', 15000, {
            label: '撤销',
            onClick: () => {
              const current = diariesRef.current.find((diary) => diary.id === change.diaryId);
              if (!canUndoAgentChange(current, next)) {
                showToast('这篇之后又改过，撤销会盖掉新内容，没有撤销', 'info', 5000);
                return;
              }
              updateRef.current(change.diaryId, { content: previous });
              void writeLog({ changeId: change.id, diaryId: change.diaryId, result: 'undone' });
              showToast(`已撤销 Claude 对《${title}》的修改`, 'success');
            },
          });
        }
      } catch (err) {
        console.warn('[agent-inbox] check failed', err);
      } finally {
        busy = false;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, []);
};
