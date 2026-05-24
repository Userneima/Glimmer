import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID, type Diary, type AutoAnalysisState } from '../types';
import { storage } from '../utils/storage';
import { useAiAnalysis } from './useAiAnalysis';
import { extractDiaryInsight, hashDiaryContent, stripDiaryHtml } from '../utils/diaryReview';
import { useAuth } from '../context/useAuth';
import { cloud } from '../utils/cloud';

const AUTO_ANALYSIS_STABLE_MS = 16 * 60 * 60 * 1000;
const AUTO_ANALYSIS_MIN_TEXT_LENGTH = 60;
const MAX_AUTO_ANALYSES_PER_OPEN = 2;
const RETRY_AFTER_FAILURE_MS = 6 * 60 * 60 * 1000;

const isSystemDiary = (diary: Diary) =>
  diary.id === LONG_TERM_MASTER_ID ||
  diary.id === TEMPLATE_DIARY_ID ||
  diary.isLongTermMaster ||
  diary.isTemplateDiary;

export function useAutoDiaryAnalysis(diaries: Diary[]) {
  const { user, isConfigured } = useAuth();
  const userId = user?.id ?? null;
  const { analyze } = useAiAnalysis();
  const [state, setState] = useState<Record<string, AutoAnalysisState>>(() => storage.getAutoAnalysisState());
  const inFlightRef = useRef<Set<string>>(new Set());
  const sessionAutoCountRef = useRef(0);

  const unreadDiaryIds = useMemo(() => {
    return new Set(
      Object.entries(state)
        .filter(([, item]) => item.autoAnalyzedAt && !item.readAt)
        .map(([diaryId]) => diaryId)
    );
  }, [state]);

  const refreshState = useCallback(() => {
    setState(storage.getAutoAnalysisState());
  }, []);

  const markDiaryAnalysisRead = useCallback((diaryId: string) => {
    const item = storage.getAutoAnalysisState()[diaryId];
    if (!item?.autoAnalyzedAt || item.readAt) return;
    setState(storage.updateAutoAnalysisState(diaryId, { readAt: Date.now() }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refreshState, 0);
    return () => window.clearTimeout(timer);
  }, [refreshState]);

  useEffect(() => {
    if (diaries.length === 0) return;

    const timer = window.setTimeout(() => {
      const now = Date.now();
      const autoState = storage.getAutoAnalysisState();
      const analyses = storage.getAnalyses();
      const analyzedDiaryIds = new Set(analyses.map((analysis) => analysis.diaryId).filter(Boolean));

      const candidates = diaries
        .filter((diary) => {
          if (sessionAutoCountRef.current >= MAX_AUTO_ANALYSES_PER_OPEN) return false;
          if (isSystemDiary(diary) || inFlightRef.current.has(diary.id)) return false;
          const item = autoState[diary.id];
          if (item?.autoAnalyzedAt || analyzedDiaryIds.has(diary.id)) return false;
          if (item?.failedAt && now - item.failedAt < RETRY_AFTER_FAILURE_MS) return false;
          if (now - diary.updatedAt < AUTO_ANALYSIS_STABLE_MS) return false;
          return stripDiaryHtml(diary.content).length >= AUTO_ANALYSIS_MIN_TEXT_LENGTH;
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_AUTO_ANALYSES_PER_OPEN - sessionAutoCountRef.current);

      candidates.forEach((diary) => {
        inFlightRef.current.add(diary.id);
        sessionAutoCountRef.current += 1;
        const contentHash = hashDiaryContent(diary.content);

        void analyze(diary.id, stripDiaryHtml(diary.content), {
          temperature: 0.25,
          allowLocalFallback: false,
          trigger: 'auto',
          contentHash,
        })
          .then(async (result) => {
            const insight = await extractDiaryInsight(diary, result);
            storage.upsertDiaryInsight(insight);
            if (userId && isConfigured) {
              void cloud.upsertDiaryInsight(userId, insight).catch(() => {});
            }
            setState(
              storage.updateAutoAnalysisState(diary.id, {
                autoAnalyzedAt: result.createdAt,
                analysisId: result.id,
                contentHash,
                notifiedAt: Date.now(),
                readAt: null,
                failedAt: undefined,
                lastError: undefined,
              })
            );
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            setState(
              storage.updateAutoAnalysisState(diary.id, {
                failedAt: Date.now(),
                lastError: message,
              })
            );
          })
          .finally(() => {
            inFlightRef.current.delete(diary.id);
          });
      });
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [analyze, diaries, isConfigured, userId]);

  return {
    unreadDiaryIds,
    markDiaryAnalysisRead,
  } as const;
}
