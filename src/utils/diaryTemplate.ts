import type { Diary } from '../types';
import { formatDateForTitle } from './date';

export const LEGACY_DEFAULT_TEMPLATE_DIARY_TITLE = '今天的主题';
export const DEFAULT_TEMPLATE_DIARY_TITLE = '';

export const DEFAULT_TEMPLATE_DIARY_CONTENT = [
  '<h2>流水账</h2>',
  '<p></p>',
  '<p></p>',
  '<h2>今日计划</h2>',
  '<ul data-type="taskList">',
  '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li>',
  '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li>',
  '</ul>',
].join('');

const LEADING_DATE_RE = /^(\d{8})(?:\s+)?(.*)$/;

export const buildDiaryTitleFromTemplateDiary = (templateTitle: string, timestamp: number): string => {
  const datePrefix = formatDateForTitle(timestamp);
  const trimmedTitle = templateTitle.trim();
  const normalizedTitle =
    trimmedTitle === LEGACY_DEFAULT_TEMPLATE_DIARY_TITLE ? '' : trimmedTitle;

  if (!normalizedTitle) {
    return datePrefix;
  }

  const matched = normalizedTitle.match(LEADING_DATE_RE);
  if (matched) {
    const suffix = matched[2]?.trim() ?? '';
    return suffix ? `${datePrefix} - ${suffix}` : datePrefix;
  }

  return `${datePrefix} - ${normalizedTitle}`;
};

// 补写过去某天时用：模板里的「今日计划」对已经过完的那天没有意义，
// 只留「流水账」那部分。模板被改过、没有这个标题时原样返回。
export const removeTodayPlanSection = (content: string): string => {
  if (typeof DOMParser === 'undefined') return content;

  const doc = new DOMParser().parseFromString(`<main>${content}</main>`, 'text/html');
  const main = doc.querySelector('main');
  if (!main) return content;

  const heading = Array.from(main.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .find((node) => (node.textContent ?? '').replace(/\s+/g, '') === '今日计划');
  if (!heading) return content;

  const level = Number(heading.tagName.slice(1));
  const toRemove: Element[] = [];
  let node: Element | null = heading;
  while (node) {
    if (node !== heading) {
      const match = /^H([1-6])$/.exec(node.tagName);
      if (match && Number(match[1]) <= level) break;
    }
    toRemove.push(node);
    node = node.nextElementSibling;
  }

  toRemove.forEach((item) => item.remove());
  return main.innerHTML;
};

export const buildDiaryFromTemplateDiary = ({
  templateDiary,
  createdAt,
  folderId,
}: {
  templateDiary: Diary;
  createdAt: number;
  folderId: string | null;
}): Pick<Diary, 'title' | 'content' | 'folderId' | 'tags' | 'createdAt' | 'updatedAt'> => ({
  title: buildDiaryTitleFromTemplateDiary(templateDiary.title, createdAt),
  content: templateDiary.content,
  folderId,
  tags: [...templateDiary.tags],
  createdAt,
  updatedAt: createdAt,
});
