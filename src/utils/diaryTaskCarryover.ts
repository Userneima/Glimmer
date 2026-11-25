import type { Diary } from '../types';
import { isSystemDiary } from './diarySystem';
import { diaryDay } from './date';

const DISMISSED_CARRYOVER_KEY = 'glimmer-task-carryover-dismissed-v1';
const PLACEHOLDER_TASK_TEXTS = new Set([
  '下一步最小动作',
  '需要确认的关键事项',
]);

export type CarryoverTask = {
  /** 归一化文字加上它是第几条同名事项，例如「跑步#1」。同名事项各算各的。 */
  id: string;
  text: string;
  html: string;
  /** 挪进目标日记时写在条目上的标记（data-task-id），撤销时靠它认回这一条，改了字也认得出。 */
  carryId?: string;
};

export type TaskCarryoverSuggestion = {
  sourceDiary: Diary;
  tasks: CarryoverTask[];
  signature: string;
};

export const normalizeTaskText = (text: string) => text
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

// 一条事项下面有没有已经勾掉的、有内容的子项（只看它下面，不算它自己）。
const hasDoneInside = (item: Element) => Array.from(item.querySelectorAll('li[data-type="taskItem"]'))
  .some((child) => isTaskItemChecked(child) && isMeaningfulTaskItem(child));

// 一条事项下面有没有还没勾的、有内容的子项。
const hasOpenInside = (item: Element) => Array.from(item.querySelectorAll('li[data-type="taskItem"]'))
  .some((child) => !isTaskItemChecked(child) && isMeaningfulTaskItem(child));

const cloneAsUncheckedTaskHtml = (item: Element) => {
  const clone = item.cloneNode(true) as HTMLElement;
  markTaskItemUnchecked(clone);
  // 已经做完的子项留在原来那天，不跟着挪：整棵都做完了（自己勾了、下面也没有没做完的）就从挪过去的副本里拿掉。
  Array.from(clone.querySelectorAll('li[data-type="taskItem"]')).forEach((childItem) => {
    if (clone.contains(childItem) && isTaskItemChecked(childItem) && !hasOpenInside(childItem)) {
      childItem.remove();
    }
  });
  // 只删掉整棵都没有内容的子项。空白的中间层下面还挂着真实事项时要留着，不然下面那些会一起丢。
  clone.querySelectorAll('li[data-type="taskItem"]').forEach((childItem) => {
    const hasContentInside = isMeaningfulTaskItem(childItem)
      || Array.from(childItem.querySelectorAll('li[data-type="taskItem"]')).some(isMeaningfulTaskItem);
    if (!hasContentInside) {
      childItem.remove();
    }
  });
  clone.querySelectorAll('ul[data-type="taskList"]').forEach((nestedList) => {
    if (!nestedList.querySelector('li[data-type="taskItem"]')) {
      nestedList.remove();
    }
  });
  return clone.outerHTML;
};

const isCarryableItem = (item: Element) => (
  !isTaskItemChecked(item) &&
  isMeaningfulTaskItem(item) &&
  !hasMeaningfulUncheckedTaskAncestor(item)
);

// 给每条可挪的事项编号：同名的按出现顺序记成「跑步#1」「跑步#2」。
// 提取和从原日记删除都按这个编号认，同名的两条各挪各的，不会只挪一条却删掉两条。
const listCarryableItems = (doc: Document) => {
  const occurrences = new Map<string, number>();
  return Array.from(doc.querySelectorAll('li[data-type="taskItem"]'))
    .filter(isCarryableItem)
    .map((item) => {
      const normalized = normalizeTaskText(getTaskItemText(item));
      const occurrence = (occurrences.get(normalized) ?? 0) + 1;
      occurrences.set(normalized, occurrence);
      return { item, normalized, id: `${normalized}#${occurrence}` };
    });
};

export const extractIncompleteDiaryTasks = (content: string): CarryoverTask[] => {
  if (!content.trim()) return [];

  const doc = parseHtmlDocument(content);
  return listCarryableItems(doc).map(({ item, id }) => ({
    id,
    text: getTaskItemText(item),
    html: cloneAsUncheckedTaskHtml(item),
  }));
};

const textKeyOf = (task: CarryoverTask) => task.id.replace(/#\d+$/, '');

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

// 撤销挪移时用：让同一批事项的提示能重新出现。
export const undismissTaskCarryover = (signature: string) => {
  try {
    const dismissed = readDismissedCarryovers();
    if (!dismissed.delete(signature)) return;
    localStorage.setItem(DISMISSED_CARRYOVER_KEY, JSON.stringify(Array.from(dismissed)));
  } catch {
    // 同上，只是提示偏好
  }
};

// 这个判断每次渲染都会跑（打字时每按一个键都会），要往前逐篇看。所以：
// 正文里连一个未勾的勾选框都没有的日记直接跳过，不解析；解析过的按「哪篇、改到哪一版」记下来复用。
const extractCache = new Map<string, CarryoverTask[]>();
const extractIncompleteCached = (diary: Diary): CarryoverTask[] => {
  const { content } = diary;
  if (!content.includes('taskItem')) return [];
  // 编辑器存的勾选框都带 data-checked；导入的内容可能不带，那种照常解析。
  if (content.includes('data-checked') && !content.includes('data-checked="false"')) return [];
  const key = `${diary.id}:${diary.updatedAt ?? diary.createdAt}:${diary.content.length}`;
  const cached = extractCache.get(key);
  if (cached) return cached;
  const tasks = extractIncompleteDiaryTasks(diary.content);
  if (extractCache.size > 500) extractCache.clear();
  extractCache.set(key, tasks);
  return tasks;
};

export const getTaskCarryoverSuggestion = (
  diaries: Diary[],
  currentDiary: Diary | null,
): TaskCarryoverSuggestion | null => {
  if (!currentDiary || isSystemDiary(currentDiary)) return null;

  // 只往最新的那篇挪。翻回旧日记回看时不该提议把更早的事项挪进去：
  // 挪进旧日记等于把事项藏起来，原处又已经删掉了。
  // 先后按日记写的是哪一天（标题开头的日期）排，同一天再看创建时间。
  // 只看创建时间的话，今天补写昨天那篇，会被当成最新的一篇，把今天的事项挪进过去。
  const orderKey = (diary: Diary) => [diaryDay(diary).getTime(), diary.createdAt] as const;
  const compare = (a: Diary, b: Diary) => {
    const [dayA, createdA] = orderKey(a);
    const [dayB, createdB] = orderKey(b);
    return dayA - dayB || createdA - createdB;
  };
  const others = diaries.filter((diary) => !isSystemDiary(diary) && diary.id !== currentDiary.id);
  if (others.some((diary) => compare(diary, currentDiary) > 0)) return null;

  const currentTaskIds = extractDiaryTaskIds(currentDiary.content);
  const previousDiaries = others
    .filter((diary) => compare(diary, currentDiary) < 0)
    .sort((a, b) => compare(b, a) || b.updatedAt - a.updatedAt);

  for (const sourceDiary of previousDiaries) {
    const tasks = extractIncompleteCached(sourceDiary).filter((task) => !currentTaskIds.has(textKeyOf(task)));
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

// 一条事项挪走后，原日记里怎么处理：
// - 下面没有做完的子项：整条删掉，它已经完整地挪到新日记了。
// - 下面有做完的子项：留下它的文字，但去掉勾选框、变成普通列表项，下面只挂做完的那些。
//   这样看那天的日记，能看到做了什么、属于哪件事；它又不再是一条待办，不会被反复提议挪走。
//   更深的层级按同样的规则一层层处理。
const leaveDonePartsBehind = (doc: Document, item: Element) => {
  if (isTaskItemChecked(item)) return;
  if (!hasDoneInside(item)) {
    item.remove();
    return;
  }

  const context = doc.createElement('li');
  const text = doc.createElement('p');
  text.textContent = getTaskItemText(item);
  context.appendChild(text);

  const body = Array.from(item.children).find((child) => child.tagName.toLowerCase() === 'div');
  Array.from(body?.querySelectorAll(':scope > ul[data-type="taskList"]') ?? []).forEach((nested) => {
    Array.from(nested.children).forEach((child) => {
      if (child.tagName.toLowerCase() === 'li' && child.getAttribute('data-type') === 'taskItem') {
        leaveDonePartsBehind(doc, child);
      }
    });
    if (nested.children.length > 0) context.appendChild(nested);
  });

  item.replaceWith(context);
};

// 待办列表里只能放待办。上一步把某条换成了普通列表项之后，把它所在的待办列表从这里拆开：
// 前面的待办、这几条普通项（放进普通列表）、后面的待办，各成一段，顺序不变。
const splitMixedLists = (doc: Document) => {
  Array.from(doc.querySelectorAll('ul[data-type="taskList"]')).reverse().forEach((list) => {
    const children = Array.from(list.children);
    if (children.every((child) => child.getAttribute('data-type') === 'taskItem')) return;
    const runs: { task: boolean; items: Element[] }[] = [];
    children.forEach((child) => {
      const task = child.getAttribute('data-type') === 'taskItem';
      const last = runs[runs.length - 1];
      if (last && last.task === task) last.items.push(child);
      else runs.push({ task, items: [child] });
    });
    const replacements = runs.map((run) => {
      const next = doc.createElement('ul');
      if (run.task) next.setAttribute('data-type', 'taskList');
      run.items.forEach((child) => next.appendChild(child));
      return next;
    });
    list.replaceWith(...replacements);
  });
};

export const removeCarryoverTasksFromContent = (
  content: string,
  tasks: CarryoverTask[],
) => {
  if (!content.trim() || tasks.length === 0) return content;

  const carriedTaskIds = new Set(tasks.map((task) => task.id));
  const doc = parseHtmlDocument(content);
  let changed = false;

  // 先把要处理的都找出来再动，边找边改会让后面同名事项的编号错位。
  listCarryableItems(doc)
    .filter(({ id }) => carriedTaskIds.has(id))
    .forEach(({ item }) => {
      leaveDonePartsBehind(doc, item);
      changed = true;
    });

  if (!changed) return content;
  splitMixedLists(doc);

  // 挪走最后一条之后会留下一个空的 taskList 壳，一并清掉；嵌套的空列表同理。
  Array.from(doc.querySelectorAll('ul[data-type="taskList"]')).forEach((list) => {
    if (!list.querySelector('li[data-type="taskItem"]')) {
      list.remove();
    }
  });

  return doc.querySelector('main')?.innerHTML ?? content;
};

// 挪进目标日记前，给每条写上一个新标记。撤销时靠它在目标日记里认回这一条，
// 挪过去之后改了字、勾了、加了子项都认得出。
export const stampCarriedTasks = (tasks: CarryoverTask[]): CarryoverTask[] => tasks.map((task) => {
  const carryId = `carry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const doc = parseHtmlDocument(task.html);
  const item = doc.querySelector('li[data-type="taskItem"]');
  if (!item) return { ...task, carryId };
  item.setAttribute('data-task-id', carryId);
  return { ...task, carryId, html: item.outerHTML };
});

// 一条事项的内容签名：它和下面每一层的文字与勾选状态。用来判断挪过去之后有没有被改过，
// 不直接比 HTML，因为编辑器保存时会重新排版 HTML，内容没变字符串也会变。
const contentSignature = (item: Element) => Array.from(
  [item, ...Array.from(item.querySelectorAll('li[data-type="taskItem"]'))],
).map((node) => `${isTaskItemChecked(node) ? 'x' : 'o'}:${getTaskItemText(node)}`).join('|');

export const isSameTaskContent = (htmlA: string, htmlB: string) => {
  const a = parseHtmlDocument(htmlA).querySelector('li[data-type="taskItem"]');
  const b = parseHtmlDocument(htmlB).querySelector('li[data-type="taskItem"]');
  return Boolean(a && b && contentSignature(a) === contentSignature(b));
};

// 按标记把挪过来的条目从目标日记里取出来，带着它们现在的样子（改过的字、勾选状态都在）。
// 找不到的（被他删掉了）就不管。
export const takeCarriedItemsFromContent = (content: string, carryIds: string[]) => {
  const wanted = new Set(carryIds);
  const doc = parseHtmlDocument(content);
  const items: { carryId: string; html: string }[] = [];

  Array.from(doc.querySelectorAll('li[data-type="taskItem"]')).forEach((item) => {
    const carryId = item.getAttribute('data-task-id');
    if (!carryId || !wanted.has(carryId)) return;
    if (!item.isConnected) return;
    items.push({ carryId, html: item.outerHTML });
    item.remove();
  });

  if (items.length === 0) return { content, items };

  Array.from(doc.querySelectorAll('ul[data-type="taskList"]')).forEach((list) => {
    if (!list.querySelector('li[data-type="taskItem"]')) list.remove();
  });
  return { content: doc.querySelector('main')?.innerHTML ?? content, items };
};
