import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../UI/Modal';
import { useAiAnalysis } from '../../hooks/useAiAnalysis';
import { storage } from '../../utils/storage';
import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID, type AnalysisResult, type DiaryInsightItem } from '../../types';
import { t } from '../../i18n';
import { extractDiaryInsight, getDomainLabel, getInsightItems, isReusableLongTermInsightItem } from '../../utils/diaryReview';
import { useAuth } from '../../context/useAuth';
import { cloud } from '../../utils/cloud';


const escapeHtml = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const stripHtml = (input: string): string => {
  return input.replace(/<[^>]*>/g, '');
};

interface Props {
  isOpen: boolean;
  diaryId?: string | null;
  diaryContent: string;
  onClose: () => void;
  onAppendToDiary?: (content: string) => void;
  onUpdateDiary?: (id: string, updates: Record<string, unknown>) => void;
  onCreateLongTermIdea?: (title: string, content: string) => void;
  enabled?: boolean;
}

export const AnalysisPanel: React.FC<Props> = ({ isOpen, diaryId, diaryContent, onClose, onAppendToDiary, onUpdateDiary, onCreateLongTermIdea, enabled = true }) => {
  const { user, isConfigured } = useAuth();
  const userId = user?.id ?? null;
  const { analyze, loading, error } = useAiAnalysis();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [resultDiaryId, setResultDiaryId] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [insight, setInsight] = useState(() =>
    diaryId ? storage.getDiaryInsights().find(item => item.diaryId === diaryId) ?? null : null
  );



  const history = useMemo(() => {
    if (!isOpen) {
      return [];
    }
    const all = storage.getAnalyses();
    return all
      .filter(a => a.diaryId === (diaryId || null))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [isOpen, diaryId]);

  const selectedResult = useMemo(() => {
    if (selectedHistoryId) {
      const fromHistory = history.find(h => h.id === selectedHistoryId);
      if (fromHistory) {
        return fromHistory;
      }
    }
    const isResultForCurrentDiary = resultDiaryId === (diaryId || null);
    return (isResultForCurrentDiary ? result : null) || history[0] || null;
  }, [history, result, selectedHistoryId, resultDiaryId, diaryId]);

  const canReviewDiary = useMemo(() => {
    if (!enabled || !diaryId) return false;
    const diary = storage.getDiaries().find(item => item.id === diaryId);
    if (!diary) return false;
    return (
      diary.id !== LONG_TERM_MASTER_ID &&
      diary.id !== TEMPLATE_DIARY_ID &&
      !diary.isLongTermMaster &&
      !diary.isTemplateDiary &&
      !diary.isTaskDocument
    );
  }, [diaryId, enabled]);

  useEffect(() => {
    if (!isOpen || !canReviewDiary) return;
    const timer = window.setTimeout(() => {
      setInsight(diaryId ? storage.getDiaryInsights().find(item => item.diaryId === diaryId) ?? null : null);
    }, 0);
    if (history.length > 0) {
      return () => window.clearTimeout(timer);
    }

    let mounted = true;
    (async () => {
      try {
        const res = await analyze(diaryId || null, diaryContent);
        if (mounted) {
          setResult(res);
          setResultDiaryId(diaryId || null);
          if (diaryId) {
            const diary = storage.getDiaries().find(item => item.id === diaryId);
            if (diary) {
              const nextInsight = await extractDiaryInsight(diary, res);
              storage.upsertDiaryInsight(nextInsight);
              if (userId && isConfigured) {
                void cloud.upsertDiaryInsight(userId, nextInsight).catch(() => {});
              }
              setInsight(nextInsight);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [canReviewDiary, isConfigured, isOpen, diaryContent, diaryId, analyze, history.length, userId]);

  useEffect(() => {
    if (!isOpen || !canReviewDiary || !diaryId || insight || !selectedResult) return;

    let mounted = true;
    const timer = window.setTimeout(() => {
      const diary = storage.getDiaries().find(item => item.id === diaryId);
      if (!diary) return;
      void extractDiaryInsight(diary, selectedResult).then((nextInsight) => {
        storage.upsertDiaryInsight(nextInsight);
        if (userId && isConfigured) {
          void cloud.upsertDiaryInsight(userId, nextInsight).catch(() => {});
        }
        if (mounted) setInsight(nextInsight);
      });
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [canReviewDiary, diaryId, insight, isConfigured, isOpen, selectedResult, userId]);

  const handleAppendToDiary = () => {
    if (!selectedResult || !onAppendToDiary) return;

    // Format the analysis result as HTML
    let appendContent = '\n\n<hr>\n<h3>📊 AI 分析结果</h3>\n';
    appendContent += `<p><em>分析时间: ${new Date(selectedResult.createdAt).toLocaleString()}</em></p>\n`;

    if (selectedResult.summary) {
      appendContent += '<h4>📝 总结</h4>\n';
      appendContent += `<p>${escapeHtml(selectedResult.summary)}</p>\n`;
    }

    if (selectedResult.suggestions && selectedResult.suggestions.length > 0) {
      appendContent += '<h4>💡 建议</h4>\n<ul>\n';
      selectedResult.suggestions.forEach(s => {
        appendContent += `<li>${escapeHtml(s)}</li>\n`;
      });
      appendContent += '</ul>\n';
    }

    onAppendToDiary(appendContent);
    onClose();
  };

  const handleApplyTags = () => {
    if (selectedTags.size === 0 || !onUpdateDiary || !diaryId) return;
    
    onUpdateDiary(diaryId, { tags: Array.from(selectedTags) });
    onClose();
  };

  const handleReAnalyze = async () => {
    try {
      const res = await analyze(diaryId || null, diaryContent);
      setResult(res);
      setResultDiaryId(diaryId || null);
      setSelectedHistoryId(res.id);
      if (diaryId) {
        const diary = storage.getDiaries().find(item => item.id === diaryId);
        if (diary) {
          const nextInsight = await extractDiaryInsight(diary, res);
          storage.upsertDiaryInsight(nextInsight);
          if (userId && isConfigured) {
            void cloud.upsertDiaryInsight(userId, nextInsight).catch(() => {});
          }
          setInsight(nextInsight);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmInsights = () => {
    if (!diaryId || !insight) return;
    const allIds = getInsightItems(insight).map(item => item.id);
    const updated = storage.updateDiaryInsight(diaryId, {
      confirmedItemIds: Array.from(new Set([...insight.confirmedItemIds, ...allIds])),
      status: 'confirmed',
    });
    if (updated) setInsight(updated);
    if (updated && userId && isConfigured) {
      void cloud.upsertDiaryInsight(userId, updated).catch(() => {});
    }
  };

  const handleDismissInsightItem = (itemId: string) => {
    if (!diaryId || !insight) return;
    const updated = storage.updateDiaryInsight(diaryId, {
      dismissedItemIds: Array.from(new Set([...insight.dismissedItemIds, itemId])),
    });
    if (updated) setInsight(updated);
    if (updated && userId && isConfigured) {
      void cloud.upsertDiaryInsight(userId, updated).catch(() => {});
    }
  };

  const handleSaveItemAsIdea = (item: DiaryInsightItem) => {
    if (!onCreateLongTermIdea) return;
    const evidence = item.evidence.map(entry => `- ${entry.text}`).join('\n');
    const reason = item.longTermReason ? `保存理由\n${item.longTermReason}\n\n` : '';
    onCreateLongTermIdea(item.title, `${getDomainLabel(item.domain)}线索\n\n${reason}原文依据\n${evidence}`);
  };



  const handleSelectHistory = (id: string) => {
    const sel = history.find(h => h.id === id);
    if (sel) {
      setSelectedHistoryId(id);
      setResult(sel);
    }
  };

  const visibleInsightItems = insight
    ? getInsightItems(insight).filter(item => !insight.dismissedItemIds.includes(item.id))
    : [];
  const longTermCandidateItems = visibleInsightItems.filter(isReusableLongTermInsightItem);
  const otherInsightItems = visibleInsightItems.filter(item => !isReusableLongTermInsightItem(item));

  return (
    <Modal isOpen={isOpen && canReviewDiary} onClose={onClose} title={t('AI Review')} maxWidth="4xl">
      <div className="flex min-h-[500px] flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">AI 回看</h4>
            <p className="mt-1 text-xs text-slate-500">自动整理已经完成时，这里只保留需要你确认的线索。</p>
          </div>
          <button
            onClick={handleReAnalyze}
            disabled={loading}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:border-sky-200 hover:text-sky-700 disabled:text-slate-300"
          >
            {loading ? t('Analyzing...') : '重新分析'}
          </button>
        </div>

        <div className="min-w-0 flex-1">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">{t('Analyzing...')}</p>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          {(insight || selectedResult) && !loading && (
            <div className="space-y-6">
              {insight && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900">{t('Review Card')}</h4>
                      <p className="mt-1 text-xs text-slate-500">长期想法由 AI 判断；没有长期价值时不会强行显示。</p>
                    </div>
                    <button
                      onClick={handleConfirmInsights}
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-sky-700 shadow-sm ring-1 ring-sky-100 hover:bg-sky-50"
                    >
                      {insight.status === 'confirmed' ? t('Confirmed') : t('Confirm all')}
                    </button>
                  </div>

                  {insight.domains.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {insight.domains.map(domain => (
                        <span key={domain} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-100">
                          {getDomainLabel(domain)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">长期线索</div>
                    {longTermCandidateItems.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-3 text-sm text-slate-500">
                        这篇日记暂时没有 AI 判断值得长期保存的内容。
                      </div>
                    )}
                    {longTermCandidateItems.slice(0, 4).map(item => (
                        <div key={item.id} className="rounded-xl border border-white/80 bg-white/75 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {getDomainLabel(item.domain)}
                                </span>
                                <span className="text-sm font-semibold text-slate-900">{item.title}</span>
                              </div>
                              {item.evidence[0]?.text && (
                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
                                  {item.evidence[0].text}
                                </p>
                              )}
                              {item.longTermReason && (
                                <p className="mt-2 text-xs leading-relaxed text-sky-600">
                                  {item.longTermReason}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              {onCreateLongTermIdea && (
                                <button
                                  onClick={() => handleSaveItemAsIdea(item)}
                                  className="rounded-full px-2 py-1 text-xs text-sky-700 hover:bg-sky-50"
                                >
                                  {t('Save as idea')}
                                </button>
                              )}
                              <button
                                onClick={() => handleDismissInsightItem(item.id)}
                                className="rounded-full px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              >
                                {t('Not accurate')}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                    {otherInsightItems.length > 0 && (
                      <details className="rounded-xl border border-white/80 bg-white/50">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-600">
                          其他回看线索（{otherInsightItems.length}）
                        </summary>
                        <div className="space-y-2 px-3 pb-3">
                          {otherInsightItems.slice(0, 8).map(item => (
                            <div key={item.id} className="rounded-xl border border-slate-100 bg-white/75 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                      {getDomainLabel(item.domain)}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-900">{item.title}</span>
                                  </div>
                                  {item.evidence[0]?.text && (
                                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
                                      {item.evidence[0].text}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleDismissInsightItem(item.id)}
                                  className="shrink-0 rounded-full px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                >
                                  {t('Not accurate')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* Summary Section */}
              {selectedResult && (
                <details className="rounded-2xl border border-slate-200 bg-white/70">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
                    {t('Raw AI Analysis')}
                    {selectedResult.source && (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {t('Source')}: {selectedResult.source}
                      </span>
                    )}
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                    {stripHtml(selectedResult.summary)}
                  </p>
                </details>
              )}

              {/* Suggestions Section */}
              {selectedResult?.suggestions && selectedResult.suggestions.length > 0 && (
                <div>
                  <h4 className="font-semibold text-base mb-3 flex items-center gap-2">
                    💡 {t('Suggestions')}
                  </h4>
                  <ul className="space-y-2">
                    {selectedResult.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-3 bg-blue-50 p-3 rounded-lg">
                        <span className="text-blue-600 font-semibold text-sm mt-0.5">{i + 1}.</span>
                        <span className="text-sm text-gray-700 flex-1">{stripHtml(s)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tags Section */}
              {selectedResult?.tags && selectedResult.tags.length > 0 && (
                <div>
                  <h4 className="font-semibold text-base mb-3 flex items-center gap-2">
                    🏷️ {t('Tags')}
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {selectedResult.tags.map((tag, i) => (
                      <span
                        key={i}
                        className={`text-sm px-3 py-1.5 rounded-full font-medium cursor-pointer transition-all duration-200 ${
                          selectedTags.has(tag)
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        onClick={() => {
                          const newSelected = new Set(selectedTags);
                          if (newSelected.has(tag)) {
                            newSelected.delete(tag);
                          } else {
                            newSelected.add(tag);
                          }
                          setSelectedTags(newSelected);
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t space-y-3">
                {selectedResult?.tags && selectedResult.tags.length > 0 && (
                  <button
                    onClick={handleApplyTags}
                    disabled={selectedTags.size === 0}
                    className="w-full px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm inline-flex items-center justify-center disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    🏷️ {t('应用标签到日记')}
                  </button>
                )}
                {selectedResult && (
                  <button
                    onClick={handleAppendToDiary}
                    className="w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm inline-flex items-center justify-center"
                  >
                    📎 {t('添加到日记结尾')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70">
          <button
            type="button"
            onClick={() => setIsHistoryOpen(prev => !prev)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-700"
          >
            <span>{t('History')}（{history.length}）</span>
            <span className="text-xs text-slate-400">{isHistoryOpen ? '收起' : '展开'}</span>
          </button>
          {isHistoryOpen && (
            <ul className="space-y-2 border-t border-slate-100 px-4 py-3">
              {history.length === 0 && <li className="text-xs text-gray-500">{t('No diaries')}</li>}
              {history.map(h => (
                <li key={h.id}>
                  <button
                    onClick={() => handleSelectHistory(h.id)}
                    className={`w-full rounded-xl p-2 text-left transition-colors ${
                      selectedHistoryId === h.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-xs font-medium text-gray-700">
                      {new Date(h.createdAt).toLocaleString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-500">{stripHtml(h.summary).slice(0, 50)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>


    </Modal>
  );
};
