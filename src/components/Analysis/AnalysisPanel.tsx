import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../UI/Modal';
import { useAiAnalysis } from '../../hooks/useAiAnalysis';
import { storage } from '../../utils/storage';
import type { AnalysisResult } from '../../types';
import { t } from '../../i18n';


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
}

export const AnalysisPanel: React.FC<Props> = ({ isOpen, diaryId, diaryContent, onClose, onAppendToDiary, onUpdateDiary }) => {
  const { analyze, loading, error } = useAiAnalysis();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [resultDiaryId, setResultDiaryId] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());



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

  useEffect(() => {
    if (!isOpen) return;
    if (history.length > 0) {
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const res = await analyze(diaryId || null, diaryContent);
        if (mounted) {
          setResult(res);
          setResultDiaryId(diaryId || null);
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => { mounted = false; };
  }, [isOpen, diaryContent, diaryId, analyze, history.length]);
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
    } catch (err) {
      console.error(err);
    }
  };



  const handleSelectHistory = (id: string) => {
    const sel = history.find(h => h.id === id);
    if (sel) {
      setSelectedHistoryId(id);
      setResult(sel);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('AI Analysis')} maxWidth="4xl">
      <div className="flex flex-col gap-4 min-h-[500px] md:flex-row md:gap-6">
        {/* History Sidebar */}
        <div className="w-full md:w-56 overflow-auto border-b md:border-b-0 md:border-r pb-4 md:pb-0 md:pr-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">{t('History')}</h4>
            <button
              onClick={handleReAnalyze}
              disabled={loading}
              className="text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400"
            >
              {t('Analyze')}
            </button>
          </div>
          <ul className="space-y-2">
            {history.length === 0 && <li className="text-xs text-gray-500">{t('No diaries')}</li>}
            {history.map(h => (
              <li key={h.id}>
                <button
                  onClick={() => handleSelectHistory(h.id)}
                  className={`w-full text-left p-2 rounded transition-colors ${
                    selectedHistoryId === h.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
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
                  <div className="text-xs text-gray-500 truncate mt-1">{stripHtml(h.summary).slice(0, 50)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
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
          {selectedResult && !loading && (
            <div className="space-y-6">
              {/* Summary Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-base flex items-center gap-2">
                    📝 {t('Summary')}
                  </h4>
                  {selectedResult.source && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {t('Source')}: {selectedResult.source}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                  {stripHtml(selectedResult.summary)}
                </p>
              </div>

              {/* Suggestions Section */}
              {selectedResult.suggestions && selectedResult.suggestions.length > 0 && (
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
              {selectedResult.tags && selectedResult.tags.length > 0 && (
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
                <button
                  onClick={handleAppendToDiary}
                  className="w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm inline-flex items-center justify-center"
                >
                  📎 {t('添加到日记结尾')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>


    </Modal>
  );
};
