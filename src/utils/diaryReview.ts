import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID } from '../types';
import type {
  AnalysisResult,
  Diary,
  DiaryInsight,
  DiaryInsightItem,
  InsightDomain,
  ReviewDigest,
  ReviewQueryResult,
} from '../types';
import { storage } from './storage';
import { formatDate } from './date';

const MAX_AI_TEXT_LENGTH = 4200;

const DOMAIN_LABELS: Record<InsightDomain, string> = {
  health: '健康',
  course: '课程',
  work: '工作',
  interview: '面试',
  relationship: '人际',
  life: '生活',
  emotion: '情绪',
  idea: '想法',
};

const DOMAIN_KEYWORDS: Record<InsightDomain, string[]> = {
  health: ['医院', '医生', '牙', '胃', '肠', '疼', '生病', '请假', '睡眠', '休息', '药', '炎症', '健康'],
  course: ['课程', '上课', '课堂', '老师', '作业', '考试', '小课', '请假', '缺勤', '迟到', '汇报'],
  work: ['工作', '项目', '产品', '开发', '需求', '会议', '客户', '上线', '汇报', '测试', '重构'],
  interview: ['面试', '简历', '投递', '笔试', 'offer', 'hr', '面经'],
  relationship: ['朋友', '同学', '老师', '家人', '聊天', '聚会', '沟通', '认识', '老板'],
  life: ['吃饭', '通勤', '出门', '回家', '购物', '打车', '收拾', '生活', '搬家'],
  emotion: ['焦虑', '压力', '开心', '难受', '烦', '疲惫', '紧张', '沮丧', '兴奋'],
  idea: ['想法', '灵感', '设计', '方案', '复盘', '思考', '优化', '知识', '总结'],
};

const ABSENCE_KEYWORDS = ['缺勤', '没去', '没上课', '请假', '迟到', '翘课', '没参加', '没到', '旷课'];
const MIN_EVIDENCE_LENGTH = 8;

const isUserDiary = (diary: Diary) =>
  diary.id !== LONG_TERM_MASTER_ID &&
  diary.id !== TEMPLATE_DIARY_ID &&
  !diary.isLongTermMaster &&
  !diary.isTemplateDiary;

export const stripDiaryHtml = (html: string) => {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
};

export const hashDiaryContent = (content: string) => {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `review-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const splitSentences = (text: string) =>
  text
    .split(/[。！？!?；;\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);

const sentenceForKeywords = (sentences: string[], keywords: string[]) =>
  sentences.find((sentence) => keywords.some((keyword) => sentence.includes(keyword))) ?? sentences[0] ?? '';

const normalizeStringArray = (value: unknown, limit: number) =>
  (Array.isArray(value) ? value : [])
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);

const normalizeDomain = (value: unknown): InsightDomain | null => {
  if (typeof value !== 'string') return null;
  return (Object.keys(DOMAIN_LABELS) as InsightDomain[]).includes(value as InsightDomain)
    ? value as InsightDomain
    : null;
};

const normalizeEvidence = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item) {
        const raw = item as Record<string, unknown>;
        return String(raw.text ?? raw.evidence ?? '').trim();
      }
      return '';
    })
    .map((item) => item.trim())
    .filter((item) => item.length >= MIN_EVIDENCE_LENGTH)
    .slice(0, 2)
    .map((text) => ({ text }));

const normalizeItem = (value: unknown, fallbackDomain: InsightDomain): DiaryInsightItem | null => {
  if (typeof value !== 'object' || !value) return null;
  const raw = value as Record<string, unknown>;
  const title = String(raw.title ?? '').trim();
  if (!title) return null;
  const domain = normalizeDomain(raw.domain) ?? fallbackDomain;
  const confidence = raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium';
  const evidence = normalizeEvidence(raw.evidence);
  if (evidence.length === 0) return null;
  return {
    id: String(raw.id ?? createId()),
    title,
    domain,
    evidence,
    confidence,
    longTermCandidate: raw.longTermCandidate === true,
    longTermReason: typeof raw.longTermReason === 'string' ? raw.longTermReason.trim() : undefined,
  };
};

const buildLocalItems = (text: string, domain: InsightDomain, limit = 2): DiaryInsightItem[] => {
  const sentences = splitSentences(text);
  const keywords = DOMAIN_KEYWORDS[domain];
  return sentences
    .filter((sentence) => keywords.some((keyword) => sentence.includes(keyword)))
    .slice(0, limit)
    .map((sentence) => ({
      id: createId(),
      title: sentence.length > 28 ? `${sentence.slice(0, 28)}...` : sentence,
      domain,
      evidence: [{ text: sentence }],
      confidence: 'low' as const,
    }));
};

const buildLocalInsight = (diary: Diary, analysis: AnalysisResult | null, contentHash: string): DiaryInsight => {
  const text = stripDiaryHtml(diary.content);
  const sentences = splitSentences(text);
  const domains = (Object.keys(DOMAIN_KEYWORDS) as InsightDomain[]).filter((domain) =>
    DOMAIN_KEYWORDS[domain].some((keyword) => text.includes(keyword))
  );
  const importantEvents = domains
    .flatMap((domain) => buildLocalItems(text, domain, 1))
    .slice(0, 3);
  const absenceSentence = sentenceForKeywords(sentences, ABSENCE_KEYWORDS);
  const absenceCandidates = absenceSentence && ABSENCE_KEYWORDS.some((keyword) => absenceSentence.includes(keyword))
    ? [{
      id: createId(),
      title: '可能存在缺勤/请假原因',
      domain: 'course' as const,
      evidence: [{ text: absenceSentence }],
      confidence: 'medium' as const,
    }]
    : [];

  return {
    id: createId(),
    diaryId: diary.id,
    date: diary.createdAt,
    contentHash,
    summary: analysis?.summary || (sentences[0] ?? diary.title) || '暂无摘要',
    importantEvents,
    domains,
    people: [],
    places: [],
    healthSignals: buildLocalItems(text, 'health'),
    courseSignals: buildLocalItems(text, 'course'),
    workSignals: buildLocalItems(text, 'work'),
    interviewSignals: buildLocalItems(text, 'interview'),
    relationshipSignals: buildLocalItems(text, 'relationship'),
    absenceCandidates,
    confirmedItemIds: [],
    dismissedItemIds: [],
    status: 'pending',
    source: analysis?.source === 'deepseek' || analysis?.source === 'gemini' ? analysis.source : 'local',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

const parseJsonObject = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]) as Record<string, unknown>;
};

const callDeepSeekForInsight = async (diary: Diary, analysis: AnalysisResult | null, text: string) => {
  const settings = storage.getAiSettings();
  if (!settings.deepseekKey) return null;

  const endpoint = `${(settings.deepseekBaseUrl || 'https://api.deepseek.com').replace(/\/$/, '')}/v1/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.deepseekKey}`,
    },
    body: JSON.stringify({
      model: settings.deepseekModel || 'deepseek-chat',
      temperature: 0.15,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content:
            '你是中文日记回看整理助手。只返回 JSON，不要解释。目标是提取未来回看、复盘、找原因会用到的事实线索；不要给人生建议。',
        },
        {
          role: 'user',
          content: `日记标题：${diary.title}\n已有摘要：${analysis?.summary || '无'}\n正文：${text.slice(0, MAX_AI_TEXT_LENGTH)}\n\n返回 JSON 字段：summary:string, domains:string[], importantEvents:[{title,domain,evidence,confidence,longTermCandidate,longTermReason}], people:string[], places:string[], healthSignals:[], courseSignals:[], workSignals:[], interviewSignals:[], relationshipSignals:[], absenceCandidates:[]。\n规则：domain 只能是 health/course/work/interview/relationship/life/emotion/idea；evidence 必须是原文短句数组；没有明确证据就返回空数组；不要为了凑数生成。\n长期想法判断必须由你完成：只有当某条内容具备长期复用价值时，才把 longTermCandidate 设为 true，并写 longTermReason。长期价值包括：反复出现的问题、稳定偏好、个人模式、健康线索、学习/工作方法、项目判断、人际关系规律、决策依据。不要把一次性待办、日程、普通事件、当天流水账标记为长期想法。如果没有长期价值，所有 longTermCandidate 都应为 false。`,
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek insight error: ${response.status}`);
  const data = await response.json();
  const output = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
  return parseJsonObject(String(output));
};

const filterMeaningfulItems = (items: DiaryInsightItem[], options?: { allowLow?: boolean }) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!options?.allowLow && item.confidence === 'low') return false;
    if (!item.title || item.title.length < 4) return false;
    if (item.evidence.length === 0) return false;
    const key = `${item.domain}-${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const applyInsightQualityGate = (insight: DiaryInsight): DiaryInsight => ({
  ...insight,
  importantEvents: filterMeaningfulItems(insight.importantEvents),
  healthSignals: filterMeaningfulItems(insight.healthSignals, { allowLow: true }),
  courseSignals: filterMeaningfulItems(insight.courseSignals, { allowLow: true }),
  workSignals: filterMeaningfulItems(insight.workSignals),
  interviewSignals: filterMeaningfulItems(insight.interviewSignals),
  relationshipSignals: filterMeaningfulItems(insight.relationshipSignals, { allowLow: true }),
  absenceCandidates: filterMeaningfulItems(insight.absenceCandidates, { allowLow: true }),
});

export const isReusableLongTermInsightItem = (item: DiaryInsightItem) =>
  item.longTermCandidate === true &&
  item.evidence.length > 0 &&
  item.title.length >= 6;

export const extractDiaryInsight = async (diary: Diary, analysis: AnalysisResult | null): Promise<DiaryInsight> => {
  const contentHash = analysis?.contentHash || hashDiaryContent(diary.content);
  const text = stripDiaryHtml(diary.content);
  const local = applyInsightQualityGate(buildLocalInsight(diary, analysis, contentHash));

  try {
    const parsed = await callDeepSeekForInsight(diary, analysis, text);
    if (!parsed) return local;
    const domains = normalizeStringArray(parsed.domains, 6)
      .map(normalizeDomain)
      .filter(Boolean) as InsightDomain[];

    return {
      ...local,
      summary: String(parsed.summary || local.summary).trim() || local.summary,
      importantEvents: Array.isArray(parsed.importantEvents)
        ? filterMeaningfulItems(parsed.importantEvents.map((item) => normalizeItem(item, 'life')).filter(Boolean) as DiaryInsightItem[])
        : filterMeaningfulItems(local.importantEvents),
      domains: domains.length > 0 ? domains : local.domains,
      people: normalizeStringArray(parsed.people, 8),
      places: normalizeStringArray(parsed.places, 8),
      healthSignals: filterMeaningfulItems(Array.isArray(parsed.healthSignals) ? parsed.healthSignals.map((item) => normalizeItem(item, 'health')).filter(Boolean) as DiaryInsightItem[] : local.healthSignals, { allowLow: true }),
      courseSignals: filterMeaningfulItems(Array.isArray(parsed.courseSignals) ? parsed.courseSignals.map((item) => normalizeItem(item, 'course')).filter(Boolean) as DiaryInsightItem[] : local.courseSignals, { allowLow: true }),
      workSignals: filterMeaningfulItems(Array.isArray(parsed.workSignals) ? parsed.workSignals.map((item) => normalizeItem(item, 'work')).filter(Boolean) as DiaryInsightItem[] : local.workSignals),
      interviewSignals: filterMeaningfulItems(Array.isArray(parsed.interviewSignals) ? parsed.interviewSignals.map((item) => normalizeItem(item, 'interview')).filter(Boolean) as DiaryInsightItem[] : local.interviewSignals),
      relationshipSignals: filterMeaningfulItems(Array.isArray(parsed.relationshipSignals) ? parsed.relationshipSignals.map((item) => normalizeItem(item, 'relationship')).filter(Boolean) as DiaryInsightItem[] : local.relationshipSignals, { allowLow: true }),
      absenceCandidates: filterMeaningfulItems(Array.isArray(parsed.absenceCandidates) ? parsed.absenceCandidates.map((item) => normalizeItem(item, 'course')).filter(Boolean) as DiaryInsightItem[] : local.absenceCandidates, { allowLow: true }),
      source: 'deepseek',
    };
  } catch {
    return local;
  }
};

export const getInsightItems = (insight: DiaryInsight) => [
  ...insight.importantEvents,
  ...insight.healthSignals,
  ...insight.courseSignals,
  ...insight.workSignals,
  ...insight.interviewSignals,
  ...insight.relationshipSignals,
  ...insight.absenceCandidates,
];

export const getDomainLabel = (domain: InsightDomain) => DOMAIN_LABELS[domain];

export const getWeekRange = (date: Date) => {
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
};

export const getMonthRange = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
};

export const buildReviewDigest = (
  periodType: ReviewDigest['periodType'],
  range: { start: number; end: number },
  diaries: Diary[],
  insights: DiaryInsight[],
): ReviewDigest => {
  const inRangeDiaries = diaries.filter((diary) => isUserDiary(diary) && diary.createdAt >= range.start && diary.createdAt <= range.end);
  const inRangeInsights = insights.filter((insight) => insight.date >= range.start && insight.date <= range.end);
  const allItems = inRangeInsights.flatMap(getInsightItems);
  const domainCounts = new Map<InsightDomain, number>();
  inRangeInsights.forEach((insight) => insight.domains.forEach((domain) => domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)));
  const patterns = Array.from(domainCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([domain, count]) => `${DOMAIN_LABELS[domain]}出现 ${count} 天`);

  return {
    id: createId(),
    periodType,
    startDate: range.start,
    endDate: range.end,
    sourceDiaryIds: inRangeDiaries.map((diary) => diary.id),
    summary: `${formatDate(range.start)} 到 ${formatDate(range.end)} 共 ${inRangeDiaries.length} 篇日记，沉淀 ${allItems.length} 条回看线索。`,
    highlights: allItems.slice(0, 8).map((item) => item.title),
    patterns,
    risks: inRangeInsights.flatMap((insight) => insight.healthSignals).slice(0, 4).map((item) => item.title),
    unresolvedQuestions: inRangeInsights.flatMap((insight) => insight.absenceCandidates).slice(0, 4).map((item) => item.title),
    suggestedTags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

export const reviewDigestToMarkdown = (digest: ReviewDigest) => [
  `# ${digest.periodType === 'week' ? '周回顾' : '月回顾'} ${formatDate(digest.startDate)} - ${formatDate(digest.endDate)}`,
  '',
  '## 摘要',
  digest.summary,
  '',
  '## 重要事件',
  ...(digest.highlights.length > 0 ? digest.highlights.map((item) => `- ${item}`) : ['- 暂无']),
  '',
  '## 反复出现的线索',
  ...(digest.patterns.length > 0 ? digest.patterns.map((item) => `- ${item}`) : ['- 暂无']),
  '',
  '## 需要留意',
  ...(digest.risks.length > 0 ? digest.risks.map((item) => `- ${item}`) : ['- 暂无']),
  '',
  '## 未解问题',
  ...(digest.unresolvedQuestions.length > 0 ? digest.unresolvedQuestions.map((item) => `- ${item}`) : ['- 暂无']),
].join('\n');

export const searchReviewReasons = (
  diaries: Diary[],
  insights: DiaryInsight[],
  query: string,
  dates: Date[],
): ReviewQueryResult[] => {
  const keywords = query.split(/\s+/).filter(Boolean);
  const dateKeys = new Set(dates.map((date) => date.toDateString()));
  return diaries
    .filter((diary) => isUserDiary(diary) && (dateKeys.size === 0 || dateKeys.has(new Date(diary.createdAt).toDateString())))
    .map((diary) => {
      const insight = insights.find((item) => item.diaryId === diary.id);
      const text = stripDiaryHtml(diary.content);
      const items = insight ? getInsightItems(insight) : [];
      const matchedItem = items.find((item) =>
        keywords.some((keyword) => item.title.includes(keyword) || item.evidence.some((evidence) => evidence.text.includes(keyword)))
      ) ?? items.find((item) => item.domain === 'course' || item.domain === 'health') ?? null;
      const evidenceText = matchedItem?.evidence[0]?.text || sentenceForKeywords(splitSentences(text), [...keywords, ...ABSENCE_KEYWORDS]);
      return {
        diaryId: diary.id,
        date: diary.createdAt,
        title: diary.title,
        reason: matchedItem?.title || (evidenceText ? '从原文找到可能相关记录' : '未找到明确原因'),
        evidence: evidenceText ? [{ text: evidenceText }] : [],
        confidence: matchedItem ? matchedItem.confidence : evidenceText ? 'low' : 'low',
      };
    })
    .filter((result) => result.evidence.length > 0 || result.reason !== '未找到明确原因');
};
