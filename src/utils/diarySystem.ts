import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID } from '../types';
import type { Diary } from '../types';
import {
  DEFAULT_TEMPLATE_DIARY_CONTENT,
  DEFAULT_TEMPLATE_DIARY_TITLE,
  LEGACY_DEFAULT_TEMPLATE_DIARY_TITLE,
} from './diaryTemplate';

export const LEGACY_LONG_TERM_MASTER_ID = 'long-term-master';

export const isLongTermMasterDiary = (diary: Pick<Diary, 'id' | 'isLongTermMaster'>) =>
  diary.id === LONG_TERM_MASTER_ID || diary.id === LEGACY_LONG_TERM_MASTER_ID || diary.isLongTermMaster;

export const isSystemDiary = (
  diary: Pick<Diary, 'id' | 'isLongTermMaster' | 'isTemplateDiary'>,
) => isLongTermMasterDiary(diary) || diary.id === TEMPLATE_DIARY_ID || diary.isTemplateDiary;

export const normalizeLongTermMasterDiary = (
  diary: Diary,
  longTermMasterTitle: string,
): Diary => ({
  ...diary,
  id: LONG_TERM_MASTER_ID,
  title: longTermMasterTitle,
  folderId: null,
  tags: [],
  isLongTermMaster: true,
});

export const isBlankHtmlContent = (content: string | undefined) => {
  if (!content) return true;
  const text = content
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length === 0;
};

export const ensureSystemDiaries = (items: Diary[], longTermMasterTitle: string): Diary[] => {
  const legacyIdx = items.findIndex((d) => d.id === LEGACY_LONG_TERM_MASTER_ID);
  if (legacyIdx !== -1) {
    items[legacyIdx] = normalizeLongTermMasterDiary(items[legacyIdx], longTermMasterTitle);
  }

  const idx = items.findIndex((d) => d.id === LONG_TERM_MASTER_ID);
  if (idx !== -1) {
    const normalized = normalizeLongTermMasterDiary(items[idx], longTermMasterTitle);
    if (
      items[idx].title !== normalized.title ||
      items[idx].folderId !== null ||
      items[idx].tags.length > 0 ||
      !items[idx].isLongTermMaster
    ) {
      items[idx] = normalized;
    }
  } else {
    const now = Date.now();
    const master: Diary = {
      id: LONG_TERM_MASTER_ID,
      title: longTermMasterTitle,
      content: '',
      folderId: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      isLongTermMaster: true,
    };
    items = [master, ...items];
  }

  const templateIdx = items.findIndex((d) => d.id === TEMPLATE_DIARY_ID);
  if (templateIdx !== -1) {
    const templateDiary = items[templateIdx];
    const nextTitle =
      templateDiary.title.trim() === LEGACY_DEFAULT_TEMPLATE_DIARY_TITLE
        ? DEFAULT_TEMPLATE_DIARY_TITLE
        : templateDiary.title;

    if (!templateDiary.isTemplateDiary || nextTitle !== templateDiary.title) {
      items[templateIdx] = {
        ...templateDiary,
        title: nextTitle,
        isTemplateDiary: true,
      };
    }
    return items;
  }

  const now = Date.now();
  const templateDiary: Diary = {
    id: TEMPLATE_DIARY_ID,
    title: DEFAULT_TEMPLATE_DIARY_TITLE,
    content: DEFAULT_TEMPLATE_DIARY_CONTENT,
    folderId: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    isTemplateDiary: true,
  };

  return [...items, templateDiary];
};
