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

    if (
      ld &&
      isLongTermMasterDiary(rd) &&
      isBlankHtmlContent(ld.content) &&
      !isBlankHtmlContent(rd.content)
    ) {
      map.set(rd.id, rd);
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

type CloudMergeInput = {
  local: Diary[];
  remote: Diary[];
  /** 本机废纸篓里的日记 id */
  trashedIds: Set<string>;
  /** 删除还在排队、没到云端的日记 id */
  pendingDeleteIds: Set<string>;
  /** 没登录时新建或改过、还没到云端的日记 id */
  unsyncedIds: Set<string>;
};

// 拉取云端之后怎么并：留下哪些、哪些要补传、云端哪些要补删。只做判断，不读写存储。
export const planCloudMerge = ({ local, remote, trashedIds, pendingDeleteIds, unsyncedIds }: CloudMergeInput) => {
  // 本机已经删了的，不能被云端旧记录拉回来。
  const isDeletedHere = (diary: Diary) => trashedIds.has(diary.id) || pendingDeleteIds.has(diary.id);
  const remoteKept = remote.filter((diary) => !isDeletedHere(diary));

  const { merged, preservedLocal } = mergeDiariesPreferSafeLocal(local, remoteKept);

  // 本机比云端新的、没登录时新建的、以及为防空白覆盖而保留的本机版本，都要补传。
  const remoteById = new Map(remoteKept.map((diary) => [diary.id, diary]));
  const preservedIds = new Set(preservedLocal.map((diary) => diary.id));
  const uploadIds = new Set(
    merged
      .filter((diary) => {
        if (preservedIds.has(diary.id)) return true;
        const cloudCopy = remoteById.get(diary.id);
        if (cloudCopy) return (diary.updatedAt ?? diary.createdAt) > (cloudCopy.updatedAt ?? cloudCopy.createdAt);
        return unsyncedIds.has(diary.id);
      })
      .map((diary) => diary.id),
  );

  // 云端还留着、本机已进废纸篓、又没有排队删除的（比如没登录时删的），补一次删除。
  const remoteToDelete = remote.filter((diary) => trashedIds.has(diary.id) && !pendingDeleteIds.has(diary.id));

  return { merged, uploadIds, remoteToDelete };
};
