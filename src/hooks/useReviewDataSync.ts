import { useEffect } from 'react';
import { cloud } from '../utils/cloud';
import { storage } from '../utils/storage';

export function useReviewDataSync(activeUserId: string | null, isConfigured: boolean): void {
  useEffect(() => {
    if (!activeUserId || !isConfigured) return;
    let active = true;

    const mergeReviewData = async () => {
      try {
        const [remoteInsights, remoteDigests] = await Promise.all([
          cloud.fetchDiaryInsights(activeUserId),
          cloud.fetchReviewDigests(activeUserId),
        ]);
        if (!active) return;

        const localInsights = storage.getDiaryInsights();
        const insightMap = new Map(localInsights.map((insight) => [insight.diaryId, insight]));
        remoteInsights.forEach((remote) => {
          const local = insightMap.get(remote.diaryId);
          if (!local || remote.updatedAt >= local.updatedAt) {
            insightMap.set(remote.diaryId, remote);
          }
        });
        const mergedInsights = Array.from(insightMap.values());
        storage.saveDiaryInsights(mergedInsights);

        const localDigests = storage.getReviewDigests();
        const digestKey = (digest: { periodType: string; startDate: number; endDate: number }) =>
          `${digest.periodType}-${digest.startDate}-${digest.endDate}`;
        const digestMap = new Map(localDigests.map((digest) => [digestKey(digest), digest]));
        remoteDigests.forEach((remote) => {
          const local = digestMap.get(digestKey(remote));
          if (!local || remote.updatedAt >= local.updatedAt) {
            digestMap.set(digestKey(remote), remote);
          }
        });
        const mergedDigests = Array.from(digestMap.values());
        storage.saveReviewDigests(mergedDigests);

        void Promise.all([
          ...mergedInsights.map((insight) => cloud.upsertDiaryInsight(activeUserId, insight)),
          ...mergedDigests.map((digest) => cloud.upsertReviewDigest(activeUserId, digest)),
        ]).catch(() => {});
      } catch {
        // Review sync is an enhancement; local writing and reading must not be blocked.
      }
    };

    void mergeReviewData();

    return () => {
      active = false;
    };
  }, [activeUserId, isConfigured]);
}
