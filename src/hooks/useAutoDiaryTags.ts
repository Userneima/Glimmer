import { useEffect, useRef } from 'react';
import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID, type AutoAnalysisState, type Diary } from '../types';
import { storage } from '../utils/storage';
import { normalizeDiaryTag, normalizeDiaryTags } from '../utils/diaryTags';

const AUTO_TAG_STABLE_MS = 16 * 60 * 60 * 1000;
const AUTO_TAG_MIN_TEXT_LENGTH = 80;
const MAX_AUTO_TAGS_PER_OPEN = 2;
const RETRY_AFTER_FAILURE_MS = 24 * 60 * 60 * 1000;
const MAX_AI_TEXT_LENGTH = 3200;

const BANNED_TAGS = new Set([
  '今天',
  '日记',
  '总结',
  '记录',
  '流水账',
  '随笔',
  '生活记录',
  '日常记录',
  '每日记录',
  '无标签',
]);

const CANONICAL_KEYWORDS: Array<{ tag: string; keywords: string[] }> = [
  { tag: '工作进展', keywords: ['工作', '项目', '需求', '产品', '开发', '上线', '会议', '汇报', '客户', '团队'] },
  { tag: '学习成长', keywords: ['学习', '课程', '读书', '阅读', '训练', '复习', '考试', '知识', '方法'] },
  { tag: '健康管理', keywords: ['健康', '医院', '医生', '睡眠', '运动', '生病', '牙', '肠胃', '胃', '疼', '休息'] },
  { tag: '情绪状态', keywords: ['情绪', '焦虑', '压力', '开心', '难受', '沮丧', '烦', '疲惫', '紧张'] },
  { tag: '人际关系', keywords: ['朋友', '家人', '同学', '老师', '沟通', '聊天', '聚会', '关系', '面试'] },
  { tag: '生活安排', keywords: ['吃饭', '起床', '回家', '出门', '收拾', '通勤', '购物', '做饭', '洗澡'] },
  { tag: '创作灵感', keywords: ['想法', '灵感', '设计', '写作', '方案', '思考', '复盘', '优化'] },
];

const CANONICAL_TAGS = new Set(CANONICAL_KEYWORDS.map(({ tag }) => tag));

type AutoTagResult = {
  tags: string[];
  source: 'gemini';
};

type BatchUpdateDiaries = (
  updates: Array<{ id: string; changes: Partial<Diary> }>,
  options?: { preserveUpdatedAt?: boolean; silent?: boolean },
) => void;

const htmlToText = (html: string) => {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, ' ').trim();
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
};

const hashContent = (content: string) => {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const compactTag = (value: string) =>
  normalizeDiaryTag(value).replace(/[\s#_\-—–/\\|,，.。:：;；()[\]{}<>《》"'“”‘’]+/g, '');

const isSystemDiary = (diary: Diary) =>
  diary.id === LONG_TERM_MASTER_ID ||
  diary.id === TEMPLATE_DIARY_ID ||
  diary.isLongTermMaster ||
  diary.isTemplateDiary;

const isUsefulTag = (tag: string) => {
  const normalized = normalizeDiaryTag(tag);
  const compact = compactTag(normalized);
  const length = Array.from(compact).length;
  if (!normalized || BANNED_TAGS.has(normalized) || BANNED_TAGS.has(compact)) return false;
  if (length < 2 || length > 8) return false;
  if (/^\d+$/.test(compact)) return false;
  if (/(今天|日记|总结|记录|流水账)/.test(compact)) return false;
  return true;
};

const buildExistingTagStats = (diaries: Diary[]) => {
  const counts = new Map<string, number>();
  diaries.forEach((diary) => {
    if (isSystemDiary(diary)) return;
    normalizeDiaryTags(diary.tags).forEach((tag) => {
      if (!isUsefulTag(tag)) return;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, 'zh-CN'));
};

const buildTagUsage = (diaries: Diary[]) => {
  const counts = new Map<string, number>();
  diaries.forEach((diary) => {
    if (isSystemDiary(diary)) return;
    normalizeDiaryTags(diary.tags).forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });
  return counts;
};

const getFavoriteTags = () =>
  new Set(storage.getTags().filter((tag) => tag.isFavorite).map((tag) => normalizeDiaryTag(tag.name)));

const pruneLowReuseAutoTags = (diaries: Diary[], autoState: Record<string, AutoAnalysisState>) => {
  const tagUsage = buildTagUsage(diaries);
  const favoriteTags = getFavoriteTags();

  return diaries.flatMap((diary) => {
    if (isSystemDiary(diary)) return [];

    const currentTags = normalizeDiaryTags(diary.tags);
    const generatedTags = normalizeDiaryTags(autoState[diary.id]?.autoTags ?? []);
    if (currentTags.length === 0 || generatedTags.length === 0) return [];

    const prunedTags = currentTags.filter((tag) => {
      if (!generatedTags.includes(tag)) return false;
      if ((tagUsage.get(tag) ?? 0) > 1) return false;
      if (CANONICAL_TAGS.has(tag) || favoriteTags.has(tag)) return false;
      return true;
    });

    if (prunedTags.length === 0) return [];

    return [
      {
        id: diary.id,
        changes: {
          tags: currentTags.filter((tag) => !prunedTags.includes(tag)),
        },
        prunedTags,
      },
    ];
  });
};

const findExistingEquivalent = (candidate: string, existingTags: string[]) => {
  const compactCandidate = compactTag(candidate);
  if (!compactCandidate) return null;

  return existingTags.find((tag) => {
    const compactExisting = compactTag(tag);
    return (
      compactExisting === compactCandidate ||
      compactExisting.includes(compactCandidate) ||
      compactCandidate.includes(compactExisting)
    );
  }) ?? null;
};

const isStrongCanonicalTag = (tag: string, text: string) => {
  const canonical = CANONICAL_KEYWORDS.find((item) => item.tag === tag);
  if (!canonical) return false;
  const hitCount = canonical.keywords.filter((keyword) => text.includes(keyword)).length;
  return hitCount >= 2;
};

const finalizeTags = (rawTags: string[], existingStats: Array<{ tag: string; count: number }>, text: string) => {
  const existingTags = existingStats.map(({ tag }) => tag);
  const picked: string[] = [];
  let newTagCount = 0;

  rawTags.forEach((rawTag) => {
    const normalized = normalizeDiaryTag(rawTag);
    if (!isUsefulTag(normalized)) return;

    const existing = findExistingEquivalent(normalized, existingTags);
    const tag = existing ?? normalized;

    if (!existing) {
      if (!isStrongCanonicalTag(tag, text)) return;
      if (newTagCount >= 1) return;
      newTagCount += 1;
    } else {
      const usage = existingStats.find((item) => item.tag === existing)?.count ?? 0;
      if (usage < 2 && !isStrongCanonicalTag(existing, text)) return;
    }

    if (!picked.includes(tag)) {
      picked.push(tag);
    }
  });

  return picked.slice(0, 4);
};

const parseTagsFromJsonText = (text: string) => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  const parsed = JSON.parse(jsonMatch[0]) as { tags?: unknown };
  return Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
};

const callGeminiForTags = async (text: string, existingTags: string[]) => {
  const settings = storage.getAiSettings();
  if (!settings.geminiApiKey) return null;

  const response = await fetch('https://api.gemini.google.com/v1/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.geminiApiKey}`,
    },
    body: JSON.stringify({
      prompt: `请为以下中文日记生成2-4个标签，只返回 JSON：{"tags":["..."]}。优先从已有标签选择，最多新增1个新标签。禁止使用今天、日记、总结、记录、流水账。\n\n已有标签：${existingTags.join('、') || '无'}\n\n日记正文：\n${text.slice(0, MAX_AI_TEXT_LENGTH)}`,
      temperature: 0.15,
      max_output_tokens: 160,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini tag error: ${response.status}`);
  }

  const data = await response.json();
  const output = data?.choices?.[0]?.text || data?.output || '';
  return parseTagsFromJsonText(String(output));
};

const generateAutoTags = async (
  text: string,
  existingStats: Array<{ tag: string; count: number }>,
): Promise<AutoTagResult | null> => {
  const existingTags = existingStats.map(({ tag }) => tag);

  try {
    const geminiTags = await callGeminiForTags(text, existingTags);
    if (geminiTags) {
      const tags = finalizeTags(geminiTags, existingStats, text);
      if (tags.length >= 2) return { tags, source: 'gemini' };
    }
  } catch {
    // Auto tagging is intentionally silent.
  }

  return null;
};

export function useAutoDiaryTags(diaries: Diary[], batchUpdateDiaries: BatchUpdateDiaries) {
  const inFlightRef = useRef<Set<string>>(new Set());
  const sessionAutoCountRef = useRef(0);

  useEffect(() => {
    if (diaries.length === 0) return;

    const timer = window.setTimeout(() => {
      const now = Date.now();
      const autoState = storage.getAutoAnalysisState();
      const existingStats = buildExistingTagStats(diaries);
      const pruneActions = pruneLowReuseAutoTags(diaries, autoState);

      if (pruneActions.length > 0) {
        batchUpdateDiaries(
          pruneActions.map(({ id, changes }) => ({ id, changes })),
          { preserveUpdatedAt: true, silent: true },
        );
        pruneActions.forEach(({ id, prunedTags }) => {
          const existingPruned = normalizeDiaryTags(autoState[id]?.autoTagPrunedTags ?? []);
          storage.updateAutoAnalysisState(id, {
            autoTagPrunedAt: now,
            autoTagPrunedTags: Array.from(new Set([...existingPruned, ...prunedTags])),
          } satisfies Partial<AutoAnalysisState>);
        });
      }

      const unappliedAutoTags = diaries
        .filter((diary) => {
          if (sessionAutoCountRef.current >= MAX_AUTO_TAGS_PER_OPEN) return false;
          if (isSystemDiary(diary) || inFlightRef.current.has(diary.id)) return false;
          if (normalizeDiaryTags(diary.tags).length > 0) return false;

          const item = autoState[diary.id];
          const tags = normalizeDiaryTags(item?.autoTags ?? []);
          return Boolean(item?.autoTaggedAt && !item?.autoTagAppliedAt && tags.length >= 2);
        })
        .slice(0, MAX_AUTO_TAGS_PER_OPEN - sessionAutoCountRef.current)
        .map((diary) => ({
          id: diary.id,
          tags: normalizeDiaryTags(autoState[diary.id]?.autoTags ?? []).slice(0, 4),
        }));

      if (unappliedAutoTags.length > 0) {
        sessionAutoCountRef.current += unappliedAutoTags.length;
        batchUpdateDiaries(
          unappliedAutoTags.map(({ id, tags }) => ({ id, changes: { tags } })),
          { preserveUpdatedAt: true, silent: true },
        );
        unappliedAutoTags.forEach(({ id }) => {
          storage.updateAutoAnalysisState(id, {
            autoTagAppliedAt: now,
          } satisfies Partial<AutoAnalysisState>);
        });
      }

      const candidates = diaries
        .filter((diary) => {
          if (sessionAutoCountRef.current >= MAX_AUTO_TAGS_PER_OPEN) return false;
          if (isSystemDiary(diary) || inFlightRef.current.has(diary.id)) return false;
          if (normalizeDiaryTags(diary.tags).length > 0) return false;

          const item = autoState[diary.id];
          if (item?.autoTaggedAt) return false;
          if (item?.autoTagFailedAt && now - item.autoTagFailedAt < RETRY_AFTER_FAILURE_MS) return false;
          if (now - diary.updatedAt < AUTO_TAG_STABLE_MS) return false;

          return htmlToText(diary.content).length >= AUTO_TAG_MIN_TEXT_LENGTH;
        })
        .sort((left, right) => left.updatedAt - right.updatedAt)
        .slice(0, MAX_AUTO_TAGS_PER_OPEN - sessionAutoCountRef.current);

      if (candidates.length === 0) return;

      candidates.forEach((diary) => {
        inFlightRef.current.add(diary.id);
      });
      sessionAutoCountRef.current += candidates.length;

      void (async () => {
        const updates: Array<{ id: string; changes: Partial<Diary> }> = [];
        const stateUpdates: Array<{ id: string; state: Partial<AutoAnalysisState> }> = [];

        try {
          for (const diary of candidates) {
            const text = htmlToText(diary.content);
            const contentHash = hashContent(diary.content);

            try {
              const result = await generateAutoTags(text, existingStats);
              const latestDiary = storage.getDiaries().find((item) => item.id === diary.id);
              if (!result || !latestDiary || normalizeDiaryTags(latestDiary.tags).length > 0) {
                continue;
              }

              updates.push({ id: diary.id, changes: { tags: result.tags } });
              stateUpdates.push({
                id: diary.id,
                state: {
                  autoTaggedAt: Date.now(),
                  autoTagAppliedAt: Date.now(),
                  autoTagContentHash: contentHash,
                  autoTags: result.tags,
                  autoTagSource: result.source,
                  autoTagFailedAt: undefined,
                  autoTagLastError: undefined,
                },
              });
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              storage.updateAutoAnalysisState(diary.id, {
                autoTagFailedAt: Date.now(),
                autoTagLastError: message,
              });
            }
          }

          if (updates.length > 0) {
            batchUpdateDiaries(updates, { preserveUpdatedAt: true, silent: true });
            stateUpdates.forEach(({ id, state }) => {
              storage.updateAutoAnalysisState(id, state);
            });
          }
        } finally {
          candidates.forEach((diary) => {
            inFlightRef.current.delete(diary.id);
          });
        }
      })();
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [batchUpdateDiaries, diaries]);
}
