import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Diary } from '../types';
import { canUndoAgentChange, decideAgentChange, decideAgentPlan, hashContent, insertTodayPlan, parseAgentChange } from '../utils/agentChanges';
import { isTauriRuntime } from '../utils/desktopStore';
import { markdownToHtml } from '../utils/markdown';
import { showToast } from '../utils/toast';
import { cloud } from '../utils/cloud';
import { getCurrentStorageUserId } from '../utils/storage';
import { isSupabaseConfigured } from '../utils/supabase';

// 往他自己的日记里加东西前，先确认云端没有比本机更新的版本（比如他刚在手机上写过）。
// 有、或查不了，这一轮就不加，等下次拉取把新版本带回来再说，免得拿旧版本盖掉他新写的字。
const cloudHasNewer = async (diary: Diary) => {
  const userId = getCurrentStorageUserId();
  if (!isSupabaseConfigured || !userId) return false;
  try {
    const remote = await cloud.fetchDiaryUpdatedAt(userId, diary.id);
    return remote !== null && remote > (diary.updatedAt ?? diary.createdAt);
  } catch {
    return true;
  }
};

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
          if (change.kind === 'add_today_plan') {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const planDecision = decideAgentPlan(change, diariesRef.current, openRef.current, today, Date.now());
            if (planDecision.kind === 'wait') continue; // 等他建好那天的日记或停笔，不弹提示，免得一早上反复打扰
            if (planDecision.kind === 'reject') {
              await finish(file.fileName, file.content, { result: 'rejected', reason: planDecision.reason });
              void writeLog({ changeId: change.id, day: change.day, summary: change.summary, result: 'rejected', reason: planDecision.reason });
              continue;
            }
            if (await cloudHasNewer(diariesRef.current.find((diary) => diary.id === planDecision.diaryId)!)) continue;
            // 查云端要等网络，期间他可能又写了字：用查完之后的最新版本来插。
            const planTarget = diariesRef.current.find((diary) => diary.id === planDecision.diaryId);
            if (!planTarget) continue;
            const planPrevious = planTarget.content;
            const { html: planNext, added } = insertTodayPlan(planPrevious, change.items);
            if (added.length === 0) {
              await finish(file.fileName, file.content, { result: 'rejected', reason: '这几条已经在那篇日记里了' });
              void writeLog({ changeId: change.id, diaryId: planTarget.id, summary: change.summary, result: 'rejected', reason: '这几条已经在那篇日记里了' });
              continue;
            }
            updateRef.current(planTarget.id, { content: planNext });
            await finish(file.fileName, file.content, { result: 'applied', previousContent: planPrevious, appliedContent: planNext, added });
            void writeLog({ changeId: change.id, diaryId: planTarget.id, summary: change.summary, result: 'applied', added: added.length });
            const planTitle = planTarget.title || '今天的日记';
            showToast(`Claude 往《${planTitle}》的今日计划加了 ${added.length} 条`, 'success', 15000, {
              label: '撤销',
              onClick: () => {
                const current = diariesRef.current.find((diary) => diary.id === planTarget.id);
                if (!canUndoAgentChange(current, planNext)) {
                  showToast('这篇之后又改过，撤销会盖掉新内容，没有撤销', 'info', 5000);
                  return;
                }
                updateRef.current(planTarget.id, { content: planPrevious });
                void writeLog({ changeId: change.id, diaryId: planTarget.id, result: 'undone' });
                showToast(`已撤销 Claude 加进《${planTitle}》的计划`, 'success');
              },
            });
            // 列表要等下一次渲染才是新的；同一轮再处理别的单子可能拿旧正文盖掉刚加的，剩下的 4 秒后再说。
            break;
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
