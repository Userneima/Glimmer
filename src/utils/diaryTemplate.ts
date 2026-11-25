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
