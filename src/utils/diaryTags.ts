import type { Diary } from '../types';

export type DiaryTagColors = Record<string, string>;

export type DiaryTagMergeSuggestion = {
  tags: string[];
  targetTag: string;
};

export type DiaryTagDeleteSuggestion = {
  tag: string;
  count: number;
  reason: string;
};

const DEFAULT_TAG_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-green-100 text-green-700 border-green-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-yellow-100 text-yellow-700 border-yellow-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-red-100 text-red-700 border-red-200',
  'bg-orange-100 text-orange-700 border-orange-200',
];

export const normalizeDiaryTag = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const compactDiaryTag = (value: string): string =>
  normalizeDiaryTag(value).replace(/[\s#_\-—–/\\|,，.。:：;；()[\]{}<>《》"'“”‘’]+/g, '');

export const normalizeDiaryTags = (tags: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  tags.forEach((tag) => {
    const next = normalizeDiaryTag(tag);
    if (!next || seen.has(next)) return;
    seen.add(next);
    normalized.push(next);
  });

  return normalized;
};

export const getDefaultDiaryTagColor = (tag: string): string => {
  const normalized = normalizeDiaryTag(tag);
  const index = normalized.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return DEFAULT_TAG_COLORS[index % DEFAULT_TAG_COLORS.length];
};

export const renameDiaryTag = (tags: string[], oldTag: string, newTag: string): string[] => {
  const normalizedOld = normalizeDiaryTag(oldTag);
  const normalizedNew = normalizeDiaryTag(newTag);
  if (!normalizedOld || !normalizedNew) return normalizeDiaryTags(tags);

  return normalizeDiaryTags(tags.map((tag) => (
    normalizeDiaryTag(tag) === normalizedOld ? normalizedNew : tag
  )));
};

export const mergeDiaryTags = (tags: string[], sourceTags: string[], targetTag: string): string[] => {
  const sources = new Set(sourceTags.map(normalizeDiaryTag).filter(Boolean));
  const target = normalizeDiaryTag(targetTag);
  if (sources.size === 0 || !target) return normalizeDiaryTags(tags);

  const hadSource = tags.some((tag) => sources.has(normalizeDiaryTag(tag)));
  const nextTags = tags.filter((tag) => !sources.has(normalizeDiaryTag(tag)));
  if (hadSource) nextTags.push(target);

  return normalizeDiaryTags(nextTags);
};

export const deleteDiaryTag = (tags: string[], tagToDelete: string): string[] => {
  const normalizedTarget = normalizeDiaryTag(tagToDelete);
  return normalizeDiaryTags(tags.filter((tag) => normalizeDiaryTag(tag) !== normalizedTarget));
};

export const getDiaryTagStats = (
  diaries: Diary[],
  customColors: DiaryTagColors
) => {
  const tagMap = new Map<string, number>();

  diaries.forEach((diary) => {
    normalizeDiaryTags(diary.tags).forEach((tag) => {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    });
  });

  return Array.from(tagMap.entries())
    .map(([name, count]) => ({
      name,
      count,
      color: customColors[name] || getDefaultDiaryTagColor(name),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const levenshteinDistance = (left: string, right: string): number => {
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  const previous = Array.from({ length: rightChars.length + 1 }, (_, index) => index);

  for (let i = 1; i <= leftChars.length; i += 1) {
    let prevDiagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= rightChars.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        prevDiagonal + (leftChars[i - 1] === rightChars[j - 1] ? 0 : 1)
      );
      prevDiagonal = temp;
    }
  }

  return previous[rightChars.length];
};

const areDiaryTagsLikelyDuplicates = (left: string, right: string): boolean => {
  const compactLeft = compactDiaryTag(left);
  const compactRight = compactDiaryTag(right);
  if (!compactLeft || !compactRight || compactLeft === compactRight) {
    return compactLeft === compactRight;
  }

  const minLength = Math.min(Array.from(compactLeft).length, Array.from(compactRight).length);
  const maxLength = Math.max(Array.from(compactLeft).length, Array.from(compactRight).length);
  if (minLength < 3 || maxLength - minLength > 2) return false;

  const distance = levenshteinDistance(compactLeft, compactRight);
  return distance <= 1 || distance / maxLength <= 0.2;
};

export const suggestDiaryTagMerges = (
  stats: Array<{ name: string; count: number }>
): DiaryTagMergeSuggestion[] => {
  const tags = stats.map(({ name }) => normalizeDiaryTag(name)).filter(Boolean);
  const parent = new Map<string, string>();
  const countMap = new Map(stats.map(({ name, count }) => [normalizeDiaryTag(name), count]));

  tags.forEach((tag) => parent.set(tag, tag));

  const find = (tag: string): string => {
    const root = parent.get(tag) ?? tag;
    if (root === tag) return root;
    const nextRoot = find(root);
    parent.set(tag, nextRoot);
    return nextRoot;
  };

  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (let i = 0; i < tags.length; i += 1) {
    for (let j = i + 1; j < tags.length; j += 1) {
      if (areDiaryTagsLikelyDuplicates(tags[i], tags[j])) {
        union(tags[i], tags[j]);
      }
    }
  }

  const groups = new Map<string, string[]>();
  tags.forEach((tag) => {
    const root = find(tag);
    groups.set(root, [...(groups.get(root) ?? []), tag]);
  });

  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .map((group) => {
      const sorted = [...group].sort((a, b) => {
        const countDiff = (countMap.get(b) ?? 0) - (countMap.get(a) ?? 0);
        if (countDiff !== 0) return countDiff;
        return a.length - b.length || a.localeCompare(b);
      });

      return {
        tags: group.sort((a, b) => a.localeCompare(b)),
        targetTag: sorted[0],
      };
    })
    .sort((a, b) => a.targetTag.localeCompare(b.targetTag));
};

const GENERAL_TAG_HINTS = [
  '工作',
  '学习',
  '健康',
  '生活',
  '情绪',
  '关系',
  '家庭',
  '朋友',
  '项目',
  '知识',
  '任务',
  '阅读',
  '运动',
  '财务',
  '复盘',
  '计划',
  '灵感',
  '成长',
  '管理',
];

const EVENT_TAG_PATTERNS = [
  /\d{2,}/,
  /[/-]/,
  /(面试|会议|生病|感冒|肠胃炎|旅行|考试|答辩|聚会|活动|演讲|汇报|出差|看展|搬家|生日|比赛|讲座|事故|冲突|吵架)/,
];

export const suggestEventSpecificDiaryTags = (
  stats: Array<{ name: string; count: number }>
): DiaryTagDeleteSuggestion[] => {
  return stats
    .map(({ name, count }) => ({ name: normalizeDiaryTag(name), count }))
    .filter(({ name, count }) => {
      if (!name || count > 1) return false;
      if (GENERAL_TAG_HINTS.some((hint) => name.includes(hint))) return false;

      const length = Array.from(compactDiaryTag(name)).length;
      const hasEventSignal = EVENT_TAG_PATTERNS.some((pattern) => pattern.test(name));
      return hasEventSignal || length >= 5;
    })
    .map(({ name, count }) => ({
      tag: name,
      count,
      reason: '只出现一次，且更像具体事件而不是长期分类',
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
};
