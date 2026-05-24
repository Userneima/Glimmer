import type { Diary } from '../types';
import { isBlankHtmlContent, isLongTermMasterDiary } from './diarySystem';

export const mergeDiariesPreferSafeLocal = (local: Diary[], remote: Diary[]) => {
  const map = new Map<string, Diary>(local.map((d) => [d.id, d]));
  const preservedLocal: Diary[] = [];

  remote.forEach((rd) => {
    const ld = map.get(rd.id);
    const remoteUpdatedAt = rd.updatedAt ?? rd.createdAt;
    const localUpdatedAt = ld ? ld.updatedAt ?? ld.createdAt : 0;

    if (
      ld &&
      isLongTermMasterDiary(rd) &&
      !isBlankHtmlContent(ld.content) &&
      isBlankHtmlContent(rd.content)
    ) {
      preservedLocal.push(ld);
      return;
    }

    if (!ld || remoteUpdatedAt >= localUpdatedAt) {
      map.set(rd.id, rd);
    }
  });

  return {
    merged: Array.from(map.values()),
    preservedLocal,
  };
};
