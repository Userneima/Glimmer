import type { Diary } from '../types';
import { isSystemDiary } from './diarySystem';

// 工作台的跑批脚本推进来的日记带这个标签，他自己写的没有标签。
export const AGENT_DIARY_TAG = 'agent产出';

export const isAgentDiary = (diary: Diary) => (diary.tags ?? []).includes(AGENT_DIARY_TAG);

const dayKey = (diary: Diary) => {
  // 标题以 20260919 开头时以标题为准：跑批写的那天和它被推上来的时间可能差一晚。
  const titled = (diary.title || '').trim().match(/^(\d{8})/);
  if (titled) return titled[1];

  const date = new Date(diary.createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
};

// 同一天他自己也写了的那些 agent 日记。只有他自己那份存在时才算重复，
// 他没写的日子留着 agent 那份，否则等于把那天删空了。
export const findAgentDuplicateDiaries = (diaries: Diary[]): Diary[] => {
  const ownDays = new Set(
    diaries
      .filter((diary) => !isSystemDiary(diary) && !isAgentDiary(diary))
      .map(dayKey),
  );

  return diaries.filter((diary) => (
    !isSystemDiary(diary) && isAgentDiary(diary) && ownDays.has(dayKey(diary))
  ));
};
