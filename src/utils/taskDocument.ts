import type { Diary } from '../types';

export const TASK_DOCUMENT_TAG = '任务文档';
export const TASK_DOCUMENT_TITLE_PREFIX = '任务文档 - ';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const normalizeTaskTitle = (title: string) => {
  const normalized = title.replace(/\s+/g, ' ').trim();
  return normalized || '未命名任务';
};

export const buildTaskDocumentTitle = (taskTitle: string) =>
  `${TASK_DOCUMENT_TITLE_PREFIX}${normalizeTaskTitle(taskTitle)}`;

export const isTaskDocumentDiary = (diary: Pick<Diary, 'title' | 'tags' | 'isTaskDocument'>) =>
  diary.isTaskDocument ||
  diary.tags.includes(TASK_DOCUMENT_TAG) ||
  diary.title.startsWith(TASK_DOCUMENT_TITLE_PREFIX);

const taskItem = (text: string) =>
  `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${text}</p></div></li>`;

export const buildTaskDocumentContent = (taskTitle: string) => {
  const safeTitle = escapeHtml(normalizeTaskTitle(taskTitle));
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return [
    '<h2>任务目标</h2>',
    `<p>${safeTitle}</p>`,
    '<h2>当前阶段</h2>',
    '<p>现在处在什么阶段？只写一句话。</p>',
    '<h2>执行路径 checklist</h2>',
    '<ul data-type="taskList">',
    taskItem('下一步最小动作'),
    taskItem('需要确认的关键事项'),
    '</ul>',
    '<h2>关键判断</h2>',
    '<p>记录影响方向选择的判断，不写流水账。</p>',
    '<h2>阻塞点</h2>',
    '<p>现在卡在哪里？需要谁、什么信息、什么资源？</p>',
    '<h2>每日推进记录</h2>',
    `<h3>${today}</h3>`,
    '<p><strong>今天完成了什么：</strong></p>',
    '<p></p>',
    '<p><strong>卡在哪里：</strong></p>',
    '<p></p>',
    '<p><strong>明天只做什么：</strong></p>',
    '<p></p>',
    '<h2>相关材料链接或备注</h2>',
    '<p></p>',
  ].join('');
};
