import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Diary } from '../types';
import {
  deleteDiaryTag,
  mergeDiaryTags,
  normalizeDiaryTag,
  normalizeDiaryTags,
  renameDiaryTag,
  type DiaryTagMergeSuggestion,
} from '../utils/diaryTags';

interface UseDiaryTagActionsOptions {
  diaries: Diary[];
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
  updateDiary: (id: string, updates: Partial<Diary>) => void;
  onTagsChanged?: () => void;
}

export function useDiaryTagActions({
  diaries,
  setSelectedTags,
  updateDiary,
  onTagsChanged,
}: UseDiaryTagActionsOptions) {
  const handleSelectTag = useCallback((tag: string) => {
    const normalizedTag = normalizeDiaryTag(tag);
    if (!normalizedTag) return;
    setSelectedTags(prev =>
      prev.includes(normalizedTag) ? prev.filter(t => t !== normalizedTag) : [...prev, normalizedTag]
    );
  }, [setSelectedTags]);

  const handleClearTags = useCallback(() => {
    setSelectedTags([]);
  }, [setSelectedTags]);

  const handleRenameTag = useCallback((oldTag: string, newTag: string) => {
    const normalizedOldTag = normalizeDiaryTag(oldTag);
    const normalizedNewTag = normalizeDiaryTag(newTag);
    if (!normalizedOldTag || !normalizedNewTag) return;

    diaries.forEach(diary => {
      const nextTags = renameDiaryTag(diary.tags, normalizedOldTag, normalizedNewTag);
      if (nextTags.join('\u0000') !== normalizeDiaryTags(diary.tags).join('\u0000')) {
        updateDiary(diary.id, { tags: nextTags });
      }
    });
    setSelectedTags(prev => normalizeDiaryTags(prev.map(tag => (
      normalizeDiaryTag(tag) === normalizedOldTag ? normalizedNewTag : tag
    ))));
    onTagsChanged?.();
  }, [diaries, onTagsChanged, setSelectedTags, updateDiary]);

  const handleMergeTags = useCallback((tags: string[], newTag: string) => {
    const normalizedTags = normalizeDiaryTags(tags);
    const normalizedNewTag = normalizeDiaryTag(newTag);
    if (normalizedTags.length < 2 || !normalizedNewTag) return;

    diaries.forEach(diary => {
      const nextTags = mergeDiaryTags(diary.tags, normalizedTags, normalizedNewTag);
      if (nextTags.join('\u0000') !== normalizeDiaryTags(diary.tags).join('\u0000')) {
        updateDiary(diary.id, { tags: nextTags });
      }
    });
    setSelectedTags(prev => {
      const hadMergedTag = prev.some(tag => normalizedTags.includes(normalizeDiaryTag(tag)));
      const keptTags = prev.filter(tag => !normalizedTags.includes(normalizeDiaryTag(tag)));
      return normalizeDiaryTags(hadMergedTag ? [...keptTags, normalizedNewTag] : keptTags);
    });
    onTagsChanged?.();
  }, [diaries, onTagsChanged, setSelectedTags, updateDiary]);

  const handleApplyTagMergeSuggestions = useCallback((suggestions: DiaryTagMergeSuggestion[]) => {
    if (suggestions.length === 0) return;

    diaries.forEach(diary => {
      const nextTags = suggestions.reduce(
        (tags, suggestion) => mergeDiaryTags(tags, suggestion.tags, suggestion.targetTag),
        normalizeDiaryTags(diary.tags)
      );
      if (nextTags.join('\u0000') !== normalizeDiaryTags(diary.tags).join('\u0000')) {
        updateDiary(diary.id, { tags: nextTags });
      }
    });

    setSelectedTags(prev => {
      const normalizedSelected = normalizeDiaryTags(prev);
      const nextSelected = suggestions.reduce((tags, suggestion) => {
        const sources = new Set(suggestion.tags.map(normalizeDiaryTag));
        const hadMergedTag = tags.some(tag => sources.has(normalizeDiaryTag(tag)));
        const keptTags = tags.filter(tag => !sources.has(normalizeDiaryTag(tag)));
        return normalizeDiaryTags(hadMergedTag ? [...keptTags, suggestion.targetTag] : keptTags);
      }, normalizedSelected);
      return nextSelected;
    });
    onTagsChanged?.();
  }, [diaries, onTagsChanged, setSelectedTags, updateDiary]);

  const handleDeleteTag = useCallback((tag: string) => {
    const normalizedTag = normalizeDiaryTag(tag);
    if (!normalizedTag) return;

    diaries.forEach(diary => {
      const nextTags = deleteDiaryTag(diary.tags, normalizedTag);
      if (nextTags.join('\u0000') !== normalizeDiaryTags(diary.tags).join('\u0000')) {
        updateDiary(diary.id, { tags: nextTags });
      }
    });
    setSelectedTags(prev => prev.filter(selectedTag => normalizeDiaryTag(selectedTag) !== normalizedTag));
    onTagsChanged?.();
  }, [diaries, onTagsChanged, setSelectedTags, updateDiary]);

  return {
    handleSelectTag,
    handleClearTags,
    handleRenameTag,
    handleMergeTags,
    handleApplyTagMergeSuggestions,
    handleDeleteTag,
  };
}
