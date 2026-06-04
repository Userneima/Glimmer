import type { Diary } from '../types';
import { isSystemDiary } from './diarySystem';

const DISMISSED_CARRYOVER_KEY = 'glimmer-task-carryover-dismissed-v1';
const PLACEHOLDER_TASK_TEXTS = new Set([
  '下一步最小动作',
  '需要确认的关键事项',
]);

export type CarryoverTask = {
  id: string;
  text: string;
  html: string;
};

export type TaskCarryoverSuggestion = {
  sourceDiary: Diary;
  tasks: CarryoverTask[];
  signature: string;
};

const normalizeTaskText = (text: string) => text
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\u00A0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const getDisplayTaskText = (text: string) => text
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\u00A0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stripHtmlText = (html: string) => getDisplayTaskText(html.replace(/<[^>]+>/g, ''));

const isMeaningfulTaskText = (text: string) => {
  const displayText = getDisplayTaskText(text);
  if (!displayText) return false;
  return !PLACEHOLDER_TASK_TEXTS.has(displayText);
};

const parseHtmlDocument = (html: string) => {
  const parser = new DOMParser();
  return parser.parseFromString(`<main>${html}</main>`, 'text/html');
};

const getTaskItemText = (item: Element) => {
  const contentSource = Array.from(item.children).find((child) => child.tagName.toLowerCase() === 'div');
  const content = contentSource?.cloneNode(true) as HTMLElement | null;
  if (!content) return '';
  content.querySelectorAll('ul[data-type="taskList"]').forEach((nestedList) => nestedList.remove());
  return getDisplayTaskText(content.textContent ?? '');
};

const isTaskItemChecked = (item: Element) => {
  const checkedAttr = item.getAttribute('data-checked');
  const input = item.querySelector('input[type="checkbox"]');
  return checkedAttr === 'true' || Boolean(input?.hasAttribute('checked'));
};

const isTaskItemCarried = (item: Element) => item.getAttribute('data-carryover-status') === 'carried';

const isMeaningfulTaskItem = (item: Element) => isMeaningfulTaskText(getTaskItemText(item));

const hasMeaningfulUncheckedTaskAncestor = (item: Element) => {
  let ancestor = item.parentElement?.closest('li[data-type="taskItem"]');
  while (ancestor) {
    if (!isTaskItemChecked(ancestor) && isMeaningfulTaskItem(ancestor)) {
      return true;
    }
    ancestor = ancestor.parentElement?.closest('li[data-type="taskItem"]') ?? null;
  }
  return false;
};

const markTaskItemUnchecked = (item: Element) => {
  item.setAttribute('data-checked', 'false');
  const label = Array.from(item.children).find((child) => child.tagName.toLowerCase() === 'label');
  label?.querySelector('input[type="checkbox"]')?.removeAttribute('checked');
};

const cloneAsUncheckedTaskHtml = (item: Element) => {
  const clone = item.cloneNode(true) as HTMLElement;
  markTaskItemUnchecked(clone);
  clone.querySelectorAll('li[data-type="taskItem"]').forEach((childItem) => {
    if (isTaskItemChecked(childItem) || !isMeaningfulTaskItem(childItem)) {
      childItem.remove();
      return;
    }
    markTaskItemUnchecked(childItem);
  });
  clone.querySelectorAll('ul[data-type="taskList"]').forEach((nestedList) => {
    if (!nestedList.querySelector('li[data-type="taskItem"]')) {
      nestedList.remove();
    }
  });
  return clone.outerHTML;
};

export const extractIncompleteDiaryTasks = (content: string): CarryoverTask[] => {
  if (!content.trim()) return [];

  const doc = parseHtmlDocument(content);
  const seen = new Set<string>();
  return Array.from(doc.querySelectorAll('li[data-type="taskItem"]'))
    .filter((item) => (
      !isTaskItemCarried(item) &&
      !isTaskItemChecked(item) &&
      isMeaningfulTaskItem(item) &&
      !hasMeaningfulUncheckedTaskAncestor(item)
    ))
    .map((item) => {
      const text = getTaskItemText(item);
      const normalized = normalizeTaskText(text);
      if (seen.has(normalized)) return null;
      seen.add(normalized);
      return {
        id: normalized,
        text,
        html: cloneAsUncheckedTaskHtml(item),
      };
    })
    .filter((task): task is CarryoverTask => Boolean(task));
};

const extractDiaryTaskIds = (content: string) => {
  if (!content.trim()) return new Set<string>();

  const doc = parseHtmlDocument(content);
  return new Set(
    Array.from(doc.querySelectorAll('li[data-type="taskItem"]'))
      .map((item) => normalizeTaskText(getTaskItemText(item)))
      .filter((text) => isMeaningfulTaskText(text)),
  );
};

export const buildTaskCarryoverSignature = (sourceDiaryId: string, targetDiaryId: string, tasks: CarryoverTask[]) => {
  const taskIds = tasks.map((task) => task.id).sort().join('|');
  return `${sourceDiaryId}->${targetDiaryId}:${taskIds}`;
};

const readDismissedCarryovers = () => {
  try {
    const raw = localStorage.getItem(DISMISSED_CARRYOVER_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set<string>();
  }
};

export const isTaskCarryoverDismissed = (signature: string) => readDismissedCarryovers().has(signature);

export const dismissTaskCarryover = (signature: string) => {
  try {
    const dismissed = readDismissedCarryovers();
    dismissed.add(signature);
    localStorage.setItem(DISMISSED_CARRYOVER_KEY, JSON.stringify(Array.from(dismissed).slice(-200)));
  } catch {
    // Dismissal is only a convenience preference; writing the diary must not depend on it.
  }
};

export const getTaskCarryoverSuggestion = (
  diaries: Diary[],
  currentDiary: Diary | null,
): TaskCarryoverSuggestion | null => {
  if (!currentDiary || isSystemDiary(currentDiary)) return null;

  const currentTaskIds = extractDiaryTaskIds(currentDiary.content);
  const previousDiaries = diaries
    .filter((diary) => !isSystemDiary(diary) && diary.id !== currentDiary.id && diary.createdAt < currentDiary.createdAt)
    .sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt);

  for (const sourceDiary of previousDiaries) {
    const tasks = extractIncompleteDiaryTasks(sourceDiary.content).filter((task) => !currentTaskIds.has(task.id));
    if (tasks.length === 0) continue;

    const signature = buildTaskCarryoverSignature(sourceDiary.id, currentDiary.id, tasks);
    if (isTaskCarryoverDismissed(signature)) return null;

    return {
      sourceDiary,
      tasks,
      signature,
    };
  }

  return null;
};

export const insertCarryoverTasksIntoContent = (content: string, tasks: CarryoverTask[]) => {
  if (tasks.length === 0) return content;

  const taskItemsHtml = tasks.map((task) => task.html).join('');
  const headingPattern = /<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>/gi;
  let headingMatch: RegExpExecArray | null;

  while ((headingMatch = headingPattern.exec(content)) !== null) {
    if (stripHtmlText(headingMatch[0]) !== '今日计划') continue;

    const headingEnd = headingMatch.index + headingMatch[0].length;
    const sectionEndMatch = content.slice(headingEnd).match(/<h[1-6]\b[^>]*>/i);
    const sectionEnd = typeof sectionEndMatch?.index === 'number'
      ? headingEnd + sectionEndMatch.index
      : content.length;
    const section = content.slice(headingEnd, sectionEnd);
    const taskListOpenMatch = section.match(/<ul\b(?=[^>]*\bdata-type=(["'])taskList\1)[^>]*>/i);

    if (taskListOpenMatch?.index !== undefined) {
      const insertAt = headingEnd + taskListOpenMatch.index + taskListOpenMatch[0].length;
      return `${content.slice(0, insertAt)}${taskItemsHtml}${content.slice(insertAt)}`;
    }

    const listHtml = `<ul data-type="taskList">${taskItemsHtml}</ul>`;
    return `${content.slice(0, headingEnd)}${listHtml}${content.slice(headingEnd)}`;
  }

  return `<h2>今日计划</h2><ul data-type="taskList">${taskItemsHtml}</ul>${content}`;
};

export const markCarryoverTasksAsCarried = (
  content: string,
  tasks: CarryoverTask[],
  targetDiaryId: string,
) => {
  if (!content.trim() || tasks.length === 0) return content;

  const carriedTaskIds = new Set(tasks.map((task) => task.id));
  const doc = parseHtmlDocument(content);
  let changed = false;

  Array.from(doc.querySelectorAll('li[data-type="taskItem"]')).forEach((item) => {
    if (
      isTaskItemCarried(item) ||
      isTaskItemChecked(item) ||
      !isMeaningfulTaskItem(item) ||
      hasMeaningfulUncheckedTaskAncestor(item)
    ) {
      return;
    }

    const taskId = normalizeTaskText(getTaskItemText(item));
    if (!carriedTaskIds.has(taskId)) return;

    item.setAttribute('data-carryover-status', 'carried');
    item.setAttribute('data-carried-to', targetDiaryId);
    changed = true;
  });

  return changed ? (doc.querySelector('main')?.innerHTML ?? content) : content;
};
